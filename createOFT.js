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

const DEFAULT_LOCAL_DECIMALS = 9

// Define a Hardhat task for creating OFT on Solana
// * Create the SPL Multisig account for mint authority
// * Mint the new SPL Token
// * Initialize the OFT Store account
// * Set the mint authority to the multisig account. If not in only OFT Store mode, also set the freeze authority to the multisig account.
// Note:  Only supports SPL Token Standard.
task('lz:oft:solana:create', 'Mints new SPL Token and creates new OFT Store account')
    .addOptionalParam('amount', 'The initial supply to mint on solana', process.env.INITIAL_SUPPLY, devtoolsTypes.int)
    .addParam('eid', 'Solana mainnet or testnet', process.env.ENDPOINT_ID, devtoolsTypes.eid)
    .addOptionalParam('localDecimals', 'Token local decimals', process.env.LOCAL_DECIMALS || DEFAULT_LOCAL_DECIMALS, devtoolsTypes.int)
    .addOptionalParam('sharedDecimals', 'OFT shared decimals', process.env.SHARED_DECIMALS || DEFAULT_SHARED_DECIMALS, devtoolsTypes.int)
    .addParam('name', 'Token Name', process.env.TOKEN_NAME || 'MockOFT', devtoolsTypes.string)
    .addParam('mint', 'The Token mint public key', process.env.MINT_ADDRESS || '', devtoolsTypes.string)
    .addParam('programId', 'The OFT Program id', process.env.PROGRAM_ID)
    .addParam('sellerFeeBasisPoints', 'Seller fee basis points', process.env.SELLER_FEE_BASIS_POINTS || 0, devtoolsTypes.int)
    .addParam('symbol', 'Token Symbol', process.env.TOKEN_SYMBOL || 'MOFT', devtoolsTypes.string)
    .addParam('tokenMetadataIsMutable', 'Token metadata is mutable', process.env.TOKEN_METADATA_IS_MUTABLE === 'true', devtoolsTypes.boolean)
    .addParam('additionalMinters', 'Comma-separated list of additional minters', process.env.ADDITIONAL_MINTERS, devtoolsTypes.csv, true)
    .addOptionalParam(
        'onlyOftStore',
        'If you plan to have only the OFTStore and no additional minters',
        process.env.ONLY_OFT_STORE === 'true',
        devtoolsTypes.boolean
    )
    .addParam(
        'tokenProgram',
        'The Token Program public key',
        process.env.TOKEN_PROGRAM || TOKEN_PROGRAM_ID.toBase58(),
        devtoolsTypes.string
    )
    .addParam('uri', 'URI for token metadata', process.env.TOKEN_URI || '', devtoolsTypes.string)
    .addParam('computeUnitPriceScaleFactor', 'The compute unit price scale factor', process.env.COMPUTE_UNIT_PRICE_SCALE_FACTOR || 4, devtoolsTypes.float, true)
    .setAction(
        async function({
            amount,
            eid,
            localDecimals: decimals,
            sharedDecimals,
            mint: mintStr,
            name,
            programId: programIdStr,
            sellerFeeBasisPoints,
            symbol,
            tokenMetadataIsMutable: isMutable,
            additionalMinters: additionalMintersAsStrings,
            onlyOftStore,
            tokenProgram: tokenProgramStr,
            uri,
            computeUnitPriceScaleFactor,
        }) {
            const isMABA = !!mintStr // the difference between MABA and OFT Adapter is that MABA uses mint/burn mechanism whereas OFT Adapter uses lock/unlock mechanism
            if (tokenProgramStr !== TOKEN_PROGRAM_ID.toBase58() && !isMABA) {
                throw new Error('Non-Mint-And-Burn-Adapter does not support custom token programs')
            }
            if (isMABA && amount) {
                throw new Error('Mint-And-Burn-Adapter does not support minting tokens')
            }
            if (decimals < sharedDecimals) {
                throw new Error('Solana token local decimals must be greater than or equal to OFT shared decimals')
            }
            const tokenProgramId = publicKey(tokenProgramStr)
            const { connection, umi, umiWalletKeyPair, umiWalletSigner } = await deriveConnection(eid)
            const { programId, lockBox, escrowPK, oftStorePda, eddsa } = deriveKeys(programIdStr)
            if (!additionalMintersAsStrings) {
                if (!onlyOftStore) {
                    throw new Error(
                        'If you want to proceed with only the OFT Store having the ability to mint, please specify --only-oft-store true. Note that this also means the Freeze Authority will be immediately renounced.'
                    )
                }
            }

            if (onlyOftStore) {
                await promptToContinue(
                    'You have chosen `--only-oft-store true`. This means that only the OFT Store will be able to mint new tokens and that the Freeze Authority will be immediately renounced.  Continue?'
                )
            }

            const additionalMinters = additionalMintersAsStrings?.map((minter) => new PublicKey(minter)) ?? []

            let mintAuthorityPublicKey = toWeb3JsPublicKey(oftStorePda) // we default to the OFT Store as the Mint Authority when there are no additional minters

            if (additionalMintersAsStrings) {
                // we only need a multisig when we have additional minters
                mintAuthorityPublicKey = await createMintAuthorityMultisig(
                    connection,
                    umi,
                    eid,
                    umiWalletSigner,
                    toWeb3JsPublicKey(oftStorePda),
                    toWeb3JsPublicKey(tokenProgramId), // Only configurable for MABA
                    additionalMinters,
                    computeUnitPriceScaleFactor
                )
                console.log(`created SPL multisig @ ${mintAuthorityPublicKey.toBase58()}`)
                await checkMultisigSigners(connection, mintAuthorityPublicKey, [
                    toWeb3JsPublicKey(oftStorePda),
                    ...additionalMinters,
                ])
            }

            const mint = isMABA
                ? createNoopSigner(publicKey(mintStr))
                : createSignerFromKeypair(umi, eddsa.generateKeypair())
            const isTestnet = eid == EndpointId.SOLANA_V2_TESTNET
            if (!isMABA) {
                const createV1Args = {
                    mint,
                    name,
                    symbol,
                    decimals,
                    uri,
                    isMutable,
                    sellerFeeBasisPoints: percentAmount(sellerFeeBasisPoints),
                    authority: umiWalletSigner, // authority is transferred later
                    tokenStandard: TokenStandard.Fungible,
                }
                let txBuilder = transactionBuilder().add(createV1(umi, createV1Args))
                if (amount) {
                    // recreate txBuilder since it is immutable
                    txBuilder = transactionBuilder()
                        .add(txBuilder)
                        .add(
                            mintV1(umi, {
                                ...createV1Args,
                                mint: publicKey(createV1Args.mint),
                                authority: umiWalletSigner,
                                amount,
                                tokenOwner: umiWalletSigner.publicKey,
                                tokenStandard: TokenStandard.Fungible,
                            })
                        )
                }
                txBuilder = await addComputeUnitInstructions(
                    connection,
                    umi,
                    eid,
                    txBuilder,
                    umiWalletSigner,
                    computeUnitPriceScaleFactor
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
                eid,
                txBuilder,
                umiWalletSigner,
                computeUnitPriceScaleFactor
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
                            newAuthority: onlyOftStore ? null : fromWeb3JsPublicKey(mintAuthorityPublicKey),
                            authorityType: AuthorityType.FreezeAccount,
                        })
                    )
                txBuilder = await addComputeUnitInstructions(
                    connection,
                    umi,
                    eid,
                    txBuilder,
                    umiWalletSigner,
                    computeUnitPriceScaleFactor
                )
                const { signature } = await txBuilder.sendAndConfirm(umi)
                console.log(`setAuthorityTx: ${getExplorerTxLink(bs58.encode(signature), isTestnet)}`)
            }
            output(eid, programIdStr, mint.publicKey, mintAuthorityPublicKey.toBase58(), escrowPK, oftStorePda)
        }
    )
