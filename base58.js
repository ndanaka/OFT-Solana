import assert from 'assert'
import dotenv from 'dotenv'
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import { task } from 'hardhat/config'
import { types as devtoolsTypes } from '@layerzerolabs/devtools-evm-hardhat'

// Load environment variables
dotenv.config()

// Helper function to get environment variable with fallback
const getEnvVar = (key, fallback = undefined) => {
    const value = process.env[key]
    if (!value && fallback === undefined) {
        throw new Error(`Environment variable ${key} is not defined`)
    }
    return value || fallback
}

// Get private key from environment
const getKeypair = () => {
    const privateKeyString = process.env.SOLANA_PRIVATE_KEY
    assert(privateKeyString, 'SOLANA_PRIVATE_KEY must be defined in environment')
    
    try {
        // Parse the array string into actual array
        const privateKeyArray = JSON.parse(privateKeyString)
        // Convert array to Uint8Array
        const privateKeyUint8 = new Uint8Array(privateKeyArray)
        return Keypair.fromSecretKey(privateKeyUint8)
    } catch (error) {
        throw new Error('Failed to parse SOLANA_PRIVATE_KEY. Make sure it is a valid JSON array')
    }
}

// Common environment variables for all tasks
const commonEnvVars = {
    ENDPOINT_ID: getEnvVar('ENDPOINT_ID'),
    PROGRAM_ID: getEnvVar('PROGRAM_ID'),
}

task('lz:solana:base-58', 'Outputs the base58 string for a keypair')
    .setAction(async function() {
        const keypair = getKeypair()
        console.log(`Public Key: ${keypair.publicKey.toBase58()}`)
    })

// Modified tasks to use environment variables with CLI parameter fallback
task('lz:oft:solana:create', 'Creates new OFT (Omnichain Fungible Token)')
    .addParam('eid', 'Endpoint ID', process.env.ENDPOINT_ID, devtoolsTypes.eid)
    .addParam('name', 'Token Name', process.env.TOKEN_NAME || 'Token Name', devtoolsTypes.string)
    .addParam('symbol', 'Token Symbol', process.env.TOKEN_SYMBOL || 'TKN', devtoolsTypes.string)
    .addParam('programId', 'Program ID', process.env.PROGRAM_ID, devtoolsTypes.string)
    .addParam('amount', 'Initial supply', process.env.INITIAL_SUPPLY || '0', devtoolsTypes.int)
    .setAction(async function(args) {
        // Existing implementation
    })

task('lz:oft-adapter:solana:create', 'Creates new OFT Adapter')
    .addParam('mint', 'Mint address', process.env.MINT_ADDRESS, devtoolsTypes.string)
    .addParam('programId', 'Program ID', process.env.PROGRAM_ID, devtoolsTypes.string)
    .addParam('eid', 'Endpoint ID', process.env.ENDPOINT_ID, devtoolsTypes.eid)
    .setAction(async function(args) {
        // Existing implementation
    })

task('lz:oft:solana:send', 'Send OFT tokens')
    .addParam('amount', 'Amount to send', process.env.SEND_AMOUNT, devtoolsTypes.int)
    .addParam('fromEid', 'Source endpoint', process.env.FROM_ENDPOINT_ID, devtoolsTypes.eid)
    .addParam('to', 'Recipient address', process.env.RECIPIENT_ADDRESS, devtoolsTypes.string)
    .addParam('toEid', 'Destination endpoint', process.env.TO_ENDPOINT_ID, devtoolsTypes.eid)
    .addParam('mint', 'Token mint', process.env.TOKEN_MINT, devtoolsTypes.string)
    .addParam('programId', 'Program ID', process.env.PROGRAM_ID, devtoolsTypes.string)
    .addParam('escrow', 'Escrow address', process.env.ESCROW_ADDRESS, devtoolsTypes.string)
    .setAction(async function(args) {
        // Existing implementation
    })

task('lz:oft:solana:inbound-rate-limit', 'Set inbound rate limits')
    .addParam('mint', 'Mint address', process.env.MINT_ADDRESS, devtoolsTypes.string)
    .addParam('programId', 'Program ID', process.env.PROGRAM_ID, devtoolsTypes.string)
    .addParam('eid', 'Endpoint ID', process.env.ENDPOINT_ID, devtoolsTypes.eid)
    .addParam('srcEid', 'Source endpoint', process.env.SOURCE_ENDPOINT_ID, devtoolsTypes.eid)
    .addParam('oftStore', 'OFT store address', process.env.OFT_STORE_ADDRESS, devtoolsTypes.string)
    .addParam('capacity', 'Rate limit capacity', process.env.RATE_LIMIT_CAPACITY, devtoolsTypes.bigint)
    .addParam('refillPerSecond', 'Refill rate', process.env.REFILL_RATE, devtoolsTypes.bigint)
    .setAction(async function(args) {
        // Existing implementation
    })

task('lz:solana:get-priority-fees', 'Fetches prioritization fees')
    .addParam('eid', 'Endpoint ID', process.env.ENDPOINT_ID, devtoolsTypes.eid)
    .addOptionalParam('address', 'Program ID or account address', process.env.ADDRESS, devtoolsTypes.string)
    .setAction(async function(args) {
        // Existing implementation
    })
