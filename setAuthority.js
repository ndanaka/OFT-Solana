import { publicKey, transactionBuilder } from '@metaplex-foundation/umi'
import { fromWeb3JsPublicKey, toWeb3JsKeypair, toWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters'
import { AuthorityType, TOKEN_PROGRAM_ID, createSetAuthorityInstruction, getMint } from '@solana/spl-token'
import { PublicKey } from '@solana/web3.js'
import bs58 from 'bs58'
import { task } from 'hardhat/config'

import { types as devtoolsTypes } from '@layerzerolabs/devtools-evm-hardhat'
import { EndpointId } from '@layerzerolabs/lz-definitions'
import { OftPDA } from '@layerzerolabs/oft-v2-solana-sdk'

import { checkMultisigSigners, createMintAuthorityMultisig } from './multisig'

import { addComputeUnitInstructions, deriveConnection, getExplorerTxLink } from './index'

/**
 * Derive the OFT Store account for a given program and escrow.
 * @param {string} programId 
 * @param {string} escrow
 * @returns {PublicKey}
 */
const getOftStore = (programId, escrow) => {
    const oftDeriver = new OftPDA(publicKey(programId))
    const escrowPK = publicKey(escrow)
    const [oftStorePda] = oftDeriver.oftStore(escrowPK)
    return oftStorePda
}

/**
 * Get the string representation of the authority type.
 * @param {AuthorityType} authorityType
 * @returns {string}
 */
const getAuthorityTypeString = (authorityType) => {
    switch (authorityType) {
        case AuthorityType.MintTokens:
            return 'MintTokens'
        case AuthorityType.FreezeAccount:
            return 'FreezeAccount'
        default:
            throw Error(`Unknown authority type: ${authorityType}`)
    }
}

// Define a Hardhat task for creating and setting a new Mint/Freeze Authority
// for OFT on Solana
// * Create SPL Multisig account for mint authority
// * Sanity check the new Multisig account
// * Set Mint Authority
// * Set Freeze Authority
// Note:  Only supports SPL Token Standard.
task('lz:oft:solana:setauthority', 'Create a new Mint Authority SPL multisig and set the mint/freeze authority')
    .addParam('eid', 'Solana mainnet or testnet eid', process.env.ENDPOINT_ID, devtoolsTypes.eid)
    .addParam('mint', 'The Token Mint public key', process.env.MINT_ADDRESS, devtoolsTypes.string)
    .addParam('programId', 'The OFT Program id', process.env.PROGRAM_ID, devtoolsTypes.string)
    .addParam('escrow', 'The OFT Escrow public key', process.env.ESCROW_ADDRESS, devtoolsTypes.string)
    .addParam('additionalMinters', 'Comma-separated list of additional minters', process.env.ADDITIONAL_MINTERS, devtoolsTypes.csv)
    .addOptionalParam('onlyOftStore', 'If you plan to have only the OFTStore', process.env.ONLY_OFT_STORE === 'true', devtoolsTypes.boolean)
    .addParam('tokenProgram', 'The Token Program public key', process.env.TOKEN_PROGRAM || TOKEN_PROGRAM_ID.toBase58(), devtoolsTypes.string)
    .addParam('computeUnitPriceScaleFactor', 'The compute unit price scale factor', process.env.COMPUTE_UNIT_PRICE_SCALE_FACTOR || 4, devtoolsTypes.float)
    .setAction(
        async function({
            eid,
            escrow: escrowStr,
            mint: mintStr,
            programId: programIdStr,
            tokenProgram: tokenProgramStr,
            additionalMinters: additionalMintersAsStrings,
            onlyOftStore,
            computeUnitPriceScaleFactor,
        }) {
            const { connection, umi, umiWalletKeyPair, umiWalletSigner } = await deriveConnection(eid)
            const oftStorePda = getOftStore(programIdStr, escrowStr)
            const tokenProgram = publicKey(tokenProgramStr)
            if (!additionalMintersAsStrings) {
                if (!onlyOftStore) {
                    throw new Error(
                        'If you want to proceed with only the OFTStore, please specify --only-oft-store true'
                    )
                }
                console.log(
                    'No additional minters specified.  This will result in only the OFTStore being able to mint new tokens.'
                )
            }
            const additionalMinters = additionalMintersAsStrings?.map((minter) => new PublicKey(minter)) ?? []
            const mint = new PublicKey(mintStr)
            const newMintAuthority = await createMintAuthorityMultisig(
                connection,
                umi,
                eid,
                umiWalletSigner,
                new PublicKey(oftStorePda.toString()),
                new PublicKey(tokenProgram.toString()),
                additionalMinters,
                computeUnitPriceScaleFactor
            )
            console.log(`New Mint Authority: ${newMintAuthority.toBase58()}`)
            const signers = await checkMultisigSigners(connection, newMintAuthority, [
                toWeb3JsPublicKey(oftStorePda),
                ...additionalMinters,
            ])
            console.log(`New Mint Authority Signers: ${signers.map((s) => s.toBase58()).join(', ')}`)
            for (const authorityType of [AuthorityType.MintTokens, AuthorityType.FreezeAccount]) {
                const mintAuthRet = await getMint(connection, mint, undefined, toWeb3JsPublicKey(tokenProgram))
                let currentAuthority
                if (authorityType == AuthorityType.MintTokens) {
                    if (!mintAuthRet.mintAuthority) {
                        throw new Error(`Mint ${mintStr} has no mint authority`)
                    }
                    currentAuthority = fromWeb3JsPublicKey(mintAuthRet.mintAuthority)
                } else {
                    if (!mintAuthRet.freezeAuthority) {
                        throw new Error(`Mint ${mintStr} has no freeze authority`)
                    }
                    currentAuthority = fromWeb3JsPublicKey(mintAuthRet.freezeAuthority)
                }
                if (authorityType == AuthorityType.FreezeAccount && !mintAuthRet.freezeAuthority) {
                    throw new Error(`Mint ${mintStr} has no freeze authority`)
                }
                console.log(`Current ${getAuthorityTypeString(authorityType)} Authority: ${currentAuthority}`)
                const ix = createSetAuthorityInstruction(
                    new PublicKey(mintStr),
                    toWeb3JsPublicKey(currentAuthority),
                    authorityType,
                    newMintAuthority,
                    [toWeb3JsKeypair(umiWalletKeyPair)]
                )
                const umiInstruction = {
                    programId: publicKey(ix.programId.toBase58()),
                    keys: ix.keys.map((key) => ({
                        pubkey: key.pubkey,
                        isSigner: key.isSigner,
                        isWritable: key.isWritable,
                    })),
                    data: ix.data,
                }
                let txBuilder = transactionBuilder().add({
                    instruction: umiInstruction,
                    signers: [umiWalletSigner], // Include all required signers here
                    bytesCreatedOnChain: 0,
                })
                txBuilder = await addComputeUnitInstructions(
                    connection,
                    umi,
                    eid,
                    txBuilder,
                    umiWalletSigner,
                    computeUnitPriceScaleFactor
                )
                const { signature } = await txBuilder.sendAndConfirm(umi)
                console.log(
                    `SetAuthorityTx(${getAuthorityTypeString(authorityType)}): ${getExplorerTxLink(bs58.encode(signature), eid == EndpointId.SOLANA_V2_TESTNET)}`
                )
            }
        }
    )
