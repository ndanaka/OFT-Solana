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

export const deriveConnection = async (eid) => {
    const privateKey = getSolanaPrivateKeyFromEnv()
    const connectionFactory = createSolanaConnectionFactory()
    const connection = await connectionFactory(eid)
    // ... rest of the function remains the same ...
}

// ... continue with other functions, removing type annotations ... 