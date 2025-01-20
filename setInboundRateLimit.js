import assert from 'assert'

import { mplToolbox } from '@metaplex-foundation/mpl-toolbox'
import { createSignerFromKeypair, publicKey, signerIdentity } from '@metaplex-foundation/umi'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { fromWeb3JsKeypair, toWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters'
import { Keypair, PublicKey, sendAndConfirmTransaction } from '@solana/web3.js'
import bs58 from 'bs58'
import { task } from 'hardhat/config'

import { types } from '@layerzerolabs/devtools-evm-hardhat'
import { deserializeTransactionMessage } from '@layerzerolabs/devtools-solana'
import { EndpointId } from '@layerzerolabs/lz-definitions'
import { OftPDA, accounts } from '@layerzerolabs/oft-v2-solana-sdk'
import { createOFTFactory } from '@layerzerolabs/ua-devtools-solana'

import { createSolanaConnectionFactory } from '../common/utils'

task(
    'lz:oft:solana:inbound-rate-limit',
    "Sets the Solana and EVM rate limits from './scripts/solana/utils/constants.ts'"
)
    .addParam('mint', 'The OFT token mint public key', process.env.MINT_ADDRESS, types.string)
    .addParam('programId', 'The OFT Program id', process.env.PROGRAM_ID, types.string)
    .addParam('eid', 'Solana mainnet or testnet', process.env.ENDPOINT_ID, types.eid)
    .addParam('srcEid', 'The source endpoint ID', process.env.SOURCE_ENDPOINT_ID, types.eid)
    .addParam('oftStore', 'The OFTStore account', process.env.OFT_STORE_ADDRESS, types.string)
    .addParam('capacity', 'The capacity of the rate limit', process.env.RATE_LIMIT_CAPACITY, types.bigint)
    .addParam('refillPerSecond', 'The refill rate of the rate limit', process.env.REFILL_RATE, types.bigint)
    .setAction(async function(taskArgs, hre) {
        const privateKey = process.env.SOLANA_PRIVATE_KEY
        assert(!!privateKey, 'SOLANA_PRIVATE_KEY is not defined in the environment variables.')

        const keypair = Keypair.fromSecretKey(bs58.decode(privateKey))
        const umiKeypair = fromWeb3JsKeypair(keypair)

        const connectionFactory = createSolanaConnectionFactory()
        const connection = await connectionFactory(taskArgs.eid)

        const umi = createUmi(connection.rpcEndpoint).use(mplToolbox())
        const umiWalletSigner = createSignerFromKeypair(umi, umiKeypair)
        umi.use(signerIdentity(umiWalletSigner))

        const solanaSdkFactory = createOFTFactory(
            () => toWeb3JsPublicKey(umiWalletSigner.publicKey),
            () => new PublicKey(taskArgs.programId),
            connectionFactory
        )
        const sdk = await solanaSdkFactory({
            address: new PublicKey(taskArgs.oftStore).toBase58(),
            eid: taskArgs.eid,
        })
        const solanaRateLimits = {
            capacity: taskArgs.capacity,
            refillPerSecond: taskArgs.refillPerSecond,
        }
        try {
            const tx = deserializeTransactionMessage(
                (await sdk.setInboundRateLimit(taskArgs.srcEid, solanaRateLimits)).data
            )
            tx.sign(keypair)
            const txId = await sendAndConfirmTransaction(connection, tx, [keypair])
            console.log(`Transaction successful with ID: ${txId}`)
            const [peer] = new OftPDA(publicKey(taskArgs.programId)).peer(publicKey(taskArgs.oftStore), taskArgs.srcEid)
            const peerInfo = await accounts.fetchPeerConfig({ rpc: umi.rpc }, peer)
            console.dir({ peerInfo }, { depth: null })
        } catch (error) {
            console.error(`setInboundRateLimit failed:`, error)
        }
    })
