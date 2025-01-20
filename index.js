import assert from 'assert'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

import {
    fetchAddressLookupTable,
    mplToolbox,
    setComputeUnitLimit,
    setComputeUnitPrice,
} from '@metaplex-foundation/mpl-toolbox'
import {
    createSignerFromKeypair,
    publicKey,
    signerIdentity,
    transactionBuilder,
} from '@metaplex-foundation/umi'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { createWeb3JsEddsa } from '@metaplex-foundation/umi-eddsa-web3js'
import { toWeb3JsInstruction, toWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters'
import { AddressLookupTableAccount, Connection } from '@solana/web3.js'
import { getSimulationComputeUnits } from '@solana-developers/helpers'
import bs58 from 'bs58'

import { formatEid } from '@layerzerolabs/devtools'
import { EndpointId, endpointIdToNetwork } from '@layerzerolabs/lz-definitions'
import { OftPDA } from '@layerzerolabs/oft-v2-solana-sdk'

import { createSolanaConnectionFactory } from '../common/utils'
import getFee from '../utils/getFee'

const LOOKUP_TABLE_ADDRESS = {
    [EndpointId.SOLANA_V2_MAINNET]: publicKey('AokBxha6VMLLgf97B5VYHEtqztamWmYERBmmFvjuTzJB'),
    [EndpointId.SOLANA_V2_TESTNET]: publicKey('9thqPdbR27A1yLWw2spwJLySemiGMXxPnEvfmXVk4KuK'),
}

const getFromEnv = (key) => {
    const value = process.env[key]
    if (!value) {
        throw new Error(`${key} is not defined in the environment variables.`)
    }
    return value
}

/**
 * Extracts the SOLANA_PRIVATE_KEY from the environment.  This is purposely not exported for encapsulation purposes.
 */
const getSolanaPrivateKeyFromEnv = () => getFromEnv('SOLANA_PRIVATE_KEY')

/**
 * Derive common connection and UMI objects for a given endpoint ID.
 * @param {EndpointId} eid 
 */
export const deriveConnection = async (eid) => {
    const privateKey = getSolanaPrivateKeyFromEnv()
    const connectionFactory = createSolanaConnectionFactory()
    const connection = await connectionFactory(eid)
    const umi = createUmi(connection.rpcEndpoint).use(mplToolbox())
    const umiWalletKeyPair = umi.eddsa.createKeypairFromSecretKey(bs58.decode(privateKey))
    const umiWalletSigner = createSignerFromKeypair(umi, umiWalletKeyPair)
    umi.use(signerIdentity(umiWalletSigner))
    return {
        connection,
        umi,
        umiWalletKeyPair,
        umiWalletSigner,
    }
}

/**
 * Derive the keys needed for the OFT program.
 * @param {string} programIdStr
 */
export const deriveKeys = (programIdStr) => {
    const programId = publicKey(programIdStr)
    const eddsa = createWeb3JsEddsa()
    const oftDeriver = new OftPDA(programId)
    const lockBox = eddsa.generateKeypair()
    const escrowPK = lockBox.publicKey
    const [oftStorePda] = oftDeriver.oftStore(escrowPK)
    return {
        programId,
        lockBox,
        escrowPK,
        oftStorePda,
        eddsa,
    }
}

/**
 * Outputs the OFT accounts to a JSON file.
 * @param {EndpointId} eid
 * @param {string} programId
 * @param {string} mint
 * @param {string} mintAuthority
 * @param {string} escrow
 * @param {string} oftStore
 */
export const output = (
    eid,
    programId,
    mint,
    mintAuthority,
    escrow,
    oftStore
) => {
    const outputDir = `./deployments/${endpointIdToNetwork(eid)}`
    if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true })
    }
    writeFileSync(
        `${outputDir}/OFT.json`,
        JSON.stringify(
            {
                programId,
                mint,
                mintAuthority,
                escrow,
                oftStore,
            },
            null,
            4
        )
    )
    console.log(`Accounts have been saved to ${outputDir}/OFT.json`)
}

export const getLayerZeroScanLink = (hash, isTestnet = false) =>
    isTestnet ? `https://testnet.layerzeroscan.com/tx/${hash}` : `https://layerzeroscan.com/tx/${hash}`

export const getExplorerTxLink = (hash, isTestnet = false) =>
    `https://solscan.io/tx/${hash}?cluster=${isTestnet ? 'devnet' : 'mainnet-beta'}`

export const getAddressLookupTable = async (connection, umi, fromEid) => {
    // Lookup Table Address and Priority Fee Calculation
    const lookupTableAddress = LOOKUP_TABLE_ADDRESS[fromEid]
    assert(lookupTableAddress != null, `No lookup table found for ${formatEid(fromEid)}`)
    const addressLookupTableInput = await fetchAddressLookupTable(umi, lookupTableAddress)
    if (!addressLookupTableInput) {
        throw new Error(`No address lookup table found for ${lookupTableAddress}`)
    }
    const { value: lookupTableAccount } = await connection.getAddressLookupTable(toWeb3JsPublicKey(lookupTableAddress))
    if (!lookupTableAccount) {
        throw new Error(`No address lookup table account found for ${lookupTableAddress}`)
    }
    return {
        lookupTableAddress,
        addressLookupTableInput,
        lookupTableAccount,
    }
}

export const getComputeUnitPriceAndLimit = async (
    connection,
    ixs,
    wallet,
    lookupTableAccount
) => {
    const { averageFeeExcludingZeros } = await getFee(connection)
    const priorityFee = Math.round(averageFeeExcludingZeros)
    const computeUnitPrice = BigInt(priorityFee)

    const computeUnits = await getSimulationComputeUnits(
        connection,
        ixs.map((ix) => toWeb3JsInstruction(ix)),
        toWeb3JsPublicKey(wallet.publicKey),
        [lookupTableAccount]
    )

    if (!computeUnits) {
        throw new Error('Unable to compute units')
    }

    return {
        computeUnitPrice,
        computeUnits,
    }
}

export const addComputeUnitInstructions = async (
    connection,
    umi,
    eid,
    txBuilder,
    umiWalletSigner,
    computeUnitPriceScaleFactor
) => {
    const computeUnitLimitScaleFactor = 1.1 // hardcoded to 1.1 as the estimations are not perfect and can fall slightly short of the actual CU usage on-chain
    const { addressLookupTableInput, lookupTableAccount } = await getAddressLookupTable(connection, umi, eid)
    const { computeUnitPrice, computeUnits } = await getComputeUnitPriceAndLimit(
        connection,
        txBuilder.getInstructions(),
        umiWalletSigner,
        lookupTableAccount
    )
    // Since transaction builders are immutable, we must be careful to always assign the result of the add and prepend
    // methods to a new variable.
    const newTxBuilder = transactionBuilder()
        .add(
            setComputeUnitPrice(umi, {
                microLamports: computeUnitPrice * BigInt(Math.floor(computeUnitPriceScaleFactor)),
            })
        )
        .add(setComputeUnitLimit(umi, { units: computeUnits * computeUnitLimitScaleFactor }))
        .setAddressLookupTables([addressLookupTableInput])
        .add(txBuilder)
    return newTxBuilder
}
