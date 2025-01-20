import assert from 'assert'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import { task } from 'hardhat/config'

import { types as devtoolsTypes } from '@layerzerolabs/devtools-evm-hardhat'

// Load environment variables
dotenv.config()

assert(process.env.HOME != undefined, 'process.env.HOME needs to be defined')

const defaultKeypairFile = process.env.KEYPAIR_FILE || path.resolve(process.env.HOME, '.config/solana/id.json')

// Helper function to get environment variable with fallback
const getEnvVar = (key, fallback = undefined) => {
    const value = process.env[key]
    if (!value && fallback === undefined) {
        throw new Error(`Environment variable ${key} is not defined`)
    }
    return value || fallback
}

// Common environment variables for all tasks
const commonEnvVars = {
    ENDPOINT_ID: getEnvVar('ENDPOINT_ID'),
    PROGRAM_ID: getEnvVar('PROGRAM_ID'),
}

task('lz:solana:base-58', 'Outputs the base58 string for a keypair')
    .addParam(
        'keypairFile',
        'The path to the keypair file to be used. Defaults to env KEYPAIR_FILE or ~/.config/solana/id.json',
        defaultKeypairFile,
        devtoolsTypes.string
    )
    .setAction(async function(args) {
        assert(fs.existsSync(args.keypairFile), `Keypair file not found: ${args.keypairFile}`)
        const data = fs.readFileSync(args.keypairFile, 'utf8')
        const keypairJson = JSON.parse(data)
        const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairJson))
        const base58EncodedPrivateKey = bs58.encode(keypair.secretKey)
        console.log(base58EncodedPrivateKey)
    })

// Modified tasks to use environment variables with CLI parameter fallback
task('lz:oft:solana:create', 'Creates new OFT (Omnichain Fungible Token)')
    .addParam('eid', 'Endpoint ID', getEnvVar('ENDPOINT_ID', undefined), devtoolsTypes.eid)
    .addParam('name', 'Token Name', getEnvVar('TOKEN_NAME', 'Token Name'), devtoolsTypes.string)
    .addParam('symbol', 'Token Symbol', getEnvVar('TOKEN_SYMBOL', 'TKN'), devtoolsTypes.string)
    .addParam('programId', 'Program ID', getEnvVar('PROGRAM_ID', undefined), devtoolsTypes.string)
    .addParam('amount', 'Initial supply', getEnvVar('INITIAL_SUPPLY', '0'), devtoolsTypes.int)
    .setAction(async function(args) {
        // Existing implementation
    })

task('lz:oft-adapter:solana:create', 'Creates new OFT Adapter')
    .addParam('mint', 'Mint address', getEnvVar('MINT_ADDRESS'), devtoolsTypes.string)
    .addParam('programId', 'Program ID', getEnvVar('PROGRAM_ID'), devtoolsTypes.string)
    .addParam('eid', 'Endpoint ID', getEnvVar('ENDPOINT_ID'), devtoolsTypes.eid)
    .setAction(async function(args) {
        // Existing implementation
    })

task('lz:oft:solana:send', 'Send OFT tokens')
    .addParam('amount', 'Amount to send', getEnvVar('SEND_AMOUNT'), devtoolsTypes.int)
    .addParam('fromEid', 'Source endpoint', getEnvVar('FROM_ENDPOINT_ID'), devtoolsTypes.eid)
    .addParam('to', 'Recipient address', getEnvVar('RECIPIENT_ADDRESS'), devtoolsTypes.string)
    .addParam('toEid', 'Destination endpoint', getEnvVar('TO_ENDPOINT_ID'), devtoolsTypes.eid)
    .addParam('mint', 'Token mint', getEnvVar('TOKEN_MINT'), devtoolsTypes.string)
    .addParam('programId', 'Program ID', getEnvVar('PROGRAM_ID'), devtoolsTypes.string)
    .addParam('escrow', 'Escrow address', getEnvVar('ESCROW_ADDRESS'), devtoolsTypes.string)
    .setAction(async function(args) {
        // Existing implementation
    })

task('lz:oft:solana:inbound-rate-limit', 'Set inbound rate limits')
    .addParam('mint', 'Mint address', getEnvVar('MINT_ADDRESS'), devtoolsTypes.string)
    .addParam('programId', 'Program ID', getEnvVar('PROGRAM_ID'), devtoolsTypes.string)
    .addParam('eid', 'Endpoint ID', getEnvVar('ENDPOINT_ID'), devtoolsTypes.eid)
    .addParam('srcEid', 'Source endpoint', getEnvVar('SOURCE_ENDPOINT_ID'), devtoolsTypes.eid)
    .addParam('oftStore', 'OFT store address', getEnvVar('OFT_STORE_ADDRESS'), devtoolsTypes.string)
    .addParam('capacity', 'Rate limit capacity', getEnvVar('RATE_LIMIT_CAPACITY'), devtoolsTypes.bigint)
    .addParam('refillPerSecond', 'Refill rate', getEnvVar('REFILL_RATE'), devtoolsTypes.bigint)
    .setAction(async function(args) {
        // Existing implementation
    })

task('lz:solana:get-priority-fees', 'Fetches prioritization fees')
    .addParam('eid', 'Endpoint ID', getEnvVar('ENDPOINT_ID'), devtoolsTypes.eid)
    .addOptionalParam('address', 'Program ID or account address', getEnvVar('ADDRESS', undefined), devtoolsTypes.string)
    .setAction(async function(args) {
        // Existing implementation
    })
