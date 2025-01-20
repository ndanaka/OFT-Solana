import {
    CreateV1InstructionAccounts,
    CreateV1InstructionArgs,
    TokenStandard,
    createV1,
    mintV1,
} from '@metaplex-foundation/mpl-token-metadata'
import { AuthorityType, setAuthority } from '@metaplex-foundation/mpl-toolbox'
import {
    createNoopSigner,
    createSignerFromKeypair,
    percentAmount,
    publicKey,
    transactionBuilder,
} from '@metaplex-foundation/umi'
import { fromWeb3JsPublicKey, toWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { PublicKey } from '@solana/web3.js'
import bs58 from 'bs58'
import { task } from 'hardhat/config'

import { types as devtoolsTypes } from '@layerzerolabs/devtools-evm-hardhat'
import { promptToContinue } from '@layerzerolabs/io-devtools'
import { EndpointId } from '@layerzerolabs/lz-definitions'
import { OFT_DECIMALS as DEFAULT_SHARED_DECIMALS, oft, types } from '@layerzerolabs/oft-v2-solana-sdk'

import { checkMultisigSigners, createMintAuthorityMultisig } from './multisig'
import { assertAccountInitialized } from './utils'

import { addComputeUnitInstructions, deriveConnection, deriveKeys, getExplorerTxLink, output } from './index'
import { config, getConfig } from '../config'

const DEFAULT_LOCAL_DECIMALS = 9

// Replace the task with a function that uses the config
export async function createOFT(environment = 'testnet') {
    const cfg = getConfig(environment)
    const {
        connection,
        umi,
        umiWalletKeyPair,
        umiWalletSigner
    } = await deriveConnection(cfg.endpointId)

    const {
        programId,
        lockBox,
        escrowPK,
        oftStorePda,
        eddsa
    } = deriveKeys(cfg.programId)

    // Use configuration values instead of task arguments
    const {
        name,
        symbol,
        decimals,
        sharedDecimals,
        initialSupply,
        uri,
        sellerFeeBasisPoints,
        tokenMetadataIsMutable
    } = cfg.tokenConfig

    const isMABA = !!cfg.mint // the difference between MABA and OFT Adapter is that MABA uses mint/burn mechanism whereas OFT Adapter uses lock/unlock mechanism
    if (cfg.tokenProgram !== TOKEN_PROGRAM_ID.toBase58() && !isMABA) {
        throw new Error('Non-Mint-And-Burn-Adapter does not support custom token programs')
    }
    if (isMABA && initialSupply) {
        throw new Error('Mint-And-Burn-Adapter does not support minting tokens')
    }
    if (decimals < sharedDecimals) {
        throw new Error('Solana token local decimals must be greater than or equal to OFT shared decimals')
    }
    const tokenProgramId = publicKey(cfg.tokenProgram)

    if (cfg.onlyOftStore) {
        await promptToContinue(
            'You have chosen `--only-oft-store true`. This means that only the OFT Store will be able to mint new tokens and that the Freeze Authority will be immediately renounced.  Continue?'
        )
    }

    const additionalMinters = cfg.additionalMinters?.map((minter) => new PublicKey(minter)) ?? []

    let mintAuthorityPublicKey = toWeb3JsPublicKey(oftStorePda) // we default to the OFT Store as the Mint Authority when there are no additional minters

    if (cfg.additionalMinters) {
        // we only need a multisig when we have additional minters
        mintAuthorityPublicKey = await createMintAuthorityMultisig(
            connection,
            umi,
            cfg.endpointId,
            umiWalletSigner,
            toWeb3JsPublicKey(oftStorePda),
            toWeb3JsPublicKey(tokenProgramId), // Only configurable for MABA
            additionalMinters,
            cfg.computeUnitPriceScaleFactor
        )
        console.log(`created SPL multisig @ ${mintAuthorityPublicKey.toBase58()}`)
        await checkMultisigSigners(connection, mintAuthorityPublicKey, [
            toWeb3JsPublicKey(oftStorePda),
            ...additionalMinters,
        ])
    }

    const mint = isMABA
        ? createNoopSigner(publicKey(cfg.mint))
        : createSignerFromKeypair(umi, eddsa.generateKeypair())
    const isTestnet = cfg.endpointId == EndpointId.SOLANA_V2_TESTNET
    if (!isMABA) {
        const createV1Args = {
            mint,
            name,
            symbol,
            decimals,
            uri,
            isMutable: tokenMetadataIsMutable,
            sellerFeeBasisPoints: percentAmount(sellerFeeBasisPoints),
            authority: umiWalletSigner, // authority is transferred later
            tokenStandard: TokenStandard.Fungible,
        }
        let txBuilder = transactionBuilder().add(createV1(umi, createV1Args))
        if (initialSupply) {
            // recreate txBuilder since it is immutable
            txBuilder = transactionBuilder()
                .add(txBuilder)
                .add(
                    mintV1(umi, {
                        ...createV1Args,
                        mint: publicKey(createV1Args.mint),
                        authority: umiWalletSigner,
                        amount: initialSupply,
                        tokenOwner: umiWalletSigner.publicKey,
                        tokenStandard: TokenStandard.Fungible,
                    })
                )
        }
        txBuilder = await addComputeUnitInstructions(
            connection,
            umi,
            cfg.endpointId,
            txBuilder,
            umiWalletSigner,
            cfg.computeUnitPriceScaleFactor
        )
        const createTokenTx = await txBuilder.sendAndConfirm(umi)
        await assertAccountInitialized(connection, toWeb3JsPublicKey(mint.publicKey))
        console.log(`createTokenTx: ${getExplorerTxLink(bs58.encode(createTokenTx.signature), isTestnet)}`)
    }

    const lockboxSigner = createSignerFromKeypair({ eddsa: eddsa }, lockBox)
    let txBuilder = transactionBuilder().add(
        oft.initOft(
            {
                payer: umiWalletSigner,
                admin: umiWalletKeyPair.publicKey,
                mint: mint.publicKey,
                escrow: lockboxSigner,
            },
            types.OFTType.Native,
            sharedDecimals,
            {
                oft: programId,
                token: tokenProgramId,
            }
        )
    )
    txBuilder = await addComputeUnitInstructions(
        connection,
        umi,
        cfg.endpointId,
        txBuilder,
        umiWalletSigner,
        cfg.computeUnitPriceScaleFactor
    )
    const { signature } = await txBuilder.sendAndConfirm(umi)
    console.log(`initOftTx: ${getExplorerTxLink(bs58.encode(signature), isTestnet)}`)

    if (!isMABA) {
        let txBuilder = transactionBuilder()
            .add(
                setAuthority(umi, {
                    owned: mint.publicKey,
                    owner: umiWalletSigner,
                    newAuthority: fromWeb3JsPublicKey(mintAuthorityPublicKey),
                    authorityType: AuthorityType.MintTokens,
                })
            )
            .add(
                setAuthority(umi, {
                    owned: mint.publicKey,
                    owner: umiWalletSigner,
                    newAuthority: cfg.onlyOftStore ? null : fromWeb3JsPublicKey(mintAuthorityPublicKey),
                    authorityType: AuthorityType.FreezeAccount,
                })
            )
        txBuilder = await addComputeUnitInstructions(
            connection,
            umi,
            cfg.endpointId,
            txBuilder,
            umiWalletSigner,
            cfg.computeUnitPriceScaleFactor
        )
        const { signature } = await txBuilder.sendAndConfirm(umi)
        console.log(`setAuthorityTx: ${getExplorerTxLink(bs58.encode(signature), isTestnet)}`)
    }
    output(cfg.endpointId, cfg.programId, mint.publicKey, mintAuthorityPublicKey.toBase58(), escrowPK, oftStorePda)
}

// Keep the task for backward compatibility
task('lz:oft:solana:create', 'Mints new SPL Token and creates new OFT Store account')
    .addOptionalParam('amount', 'The initial supply to mint on solana', undefined, devtoolsTypes.int)
    .addParam('eid', 'Solana mainnet or testnet', undefined, devtoolsTypes.eid)
    .addOptionalParam('localDecimals', 'Token local decimals (default=9)', DEFAULT_LOCAL_DECIMALS, devtoolsTypes.int)
    .addOptionalParam('sharedDecimals', 'OFT shared decimals (default=6)', DEFAULT_SHARED_DECIMALS, devtoolsTypes.int)
    .addParam('name', 'Token Name', 'MockOFT', devtoolsTypes.string)
    .addParam('mint', 'The Token mint public key (used for MABA only)', '', devtoolsTypes.string)
    .addParam('programId', 'The OFT Program id')
    .addParam('sellerFeeBasisPoints', 'Seller fee basis points', 0, devtoolsTypes.int)
    .addParam('symbol', 'Token Symbol', 'MOFT', devtoolsTypes.string)
    .addParam('tokenMetadataIsMutable', 'Token metadata is mutable', true, devtoolsTypes.boolean)
    .addParam('additionalMinters', 'Comma-separated list of additional minters', undefined, devtoolsTypes.csv, true)
    .addOptionalParam(
        'onlyOftStore',
        'If you plan to have only the OFTStore and no additional minters.  This is not reversible, and will result in losing the ability to mint new tokens by everything but the OFTStore.',
        false,
        devtoolsTypes.boolean
    )
    .addParam(
        'tokenProgram',
        'The Token Program public key (used for MABA only)',
        TOKEN_PROGRAM_ID.toBase58(),
        devtoolsTypes.string
    )
    .addParam('uri', 'URI for token metadata', '', devtoolsTypes.string)
    .addParam('computeUnitPriceScaleFactor', 'The compute unit price scale factor', 4, devtoolsTypes.float, true)
    .setAction(async (taskArgs) => {
        // Call the function with task args or use config
        await createOFT(taskArgs.environment)
    })
