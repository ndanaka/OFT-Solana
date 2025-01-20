const { createSignerFromKeypair, publicKey, transactionBuilder } = require('@metaplex-foundation/umi')
const { TOKEN_PROGRAM_ID, getMint } = require('@solana/spl-token')
const { PublicKey } = require('@solana/web3.js')
const bs58 = require('bs58')
const { task } = require('hardhat/config')

const { types: devtoolsTypes } = require('@layerzerolabs/devtools-evm-hardhat')
const { EndpointId } = require('@layerzerolabs/lz-definitions')
const { OFT_DECIMALS, oft, types } = require('@layerzerolabs/oft-v2-solana-sdk')

const { addComputeUnitInstructions, deriveConnection, deriveKeys, getExplorerTxLink, output } = require('./index')

// Define a Hardhat task for creating OFTAdapter on Solana
task('lz:oft-adapter:solana:create', 'Creates new OFT Adapter (OFT Store PDA)')
    .addParam('mint', 'The Token Mint public key', process.env.MINT_ADDRESS, devtoolsTypes.string)
    .addParam('programId', 'The OFT program ID', process.env.PROGRAM_ID, devtoolsTypes.string)
    .addParam('eid', 'Solana mainnet or testnet', process.env.ENDPOINT_ID, devtoolsTypes.eid)
    .addParam('tokenProgram', 'The Token Program public key', process.env.TOKEN_PROGRAM || TOKEN_PROGRAM_ID.toBase58(), devtoolsTypes.string)
    .addParam('computeUnitPriceScaleFactor', 'The compute unit price scale factor', process.env.COMPUTE_UNIT_PRICE_SCALE_FACTOR || 4, devtoolsTypes.float)
    .setAction(
        async function({
            eid,
            mint: mintStr,
            programId: programIdStr,
            tokenProgram: tokenProgramStr,
            computeUnitPriceScaleFactor,
        }) {
            const { connection, umi, umiWalletKeyPair, umiWalletSigner } = await deriveConnection(eid)
            const { programId, lockBox, escrowPK, oftStorePda, eddsa } = deriveKeys(programIdStr)

            const tokenProgram = publicKey(tokenProgramStr)
            const mint = publicKey(mintStr)

            const mintPDA = await getMint(connection, new PublicKey(mintStr), undefined, new PublicKey(tokenProgramStr))

            const mintAuthority = mintPDA.mintAuthority

            let txBuilder = transactionBuilder().add(
                oft.initOft(
                    {
                        payer: createSignerFromKeypair({ eddsa: eddsa }, umiWalletKeyPair),
                        admin: umiWalletKeyPair.publicKey,
                        mint: mint,
                        escrow: createSignerFromKeypair({ eddsa: eddsa }, lockBox),
                    },
                    types.OFTType.Adapter,
                    OFT_DECIMALS,
                    {
                        oft: programId,
                        token: tokenProgram ? publicKey(tokenProgram) : undefined,
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
            console.log(`initOftTx: ${getExplorerTxLink(bs58.encode(signature), eid == EndpointId.SOLANA_V2_TESTNET)}`)

            output(eid, programIdStr, mint, mintAuthority ? mintAuthority.toBase58() : '', escrowPK, oftStorePda)
        }
    )
