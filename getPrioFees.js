import { task } from 'hardhat/config'

import { types as devtoolsTypes } from '@layerzerolabs/devtools-evm-hardhat'
import { EndpointId } from '@layerzerolabs/lz-definitions'

import getPrioritizationFees from '../utils/getFee'

import { deriveConnection } from './index'

task('lz:solana:get-priority-fees', 'Fetches prioritization fees from the Solana network')
    .addParam('eid', 'The endpoint ID for the Solana network', undefined, devtoolsTypes.eid)
    .addOptionalParam(
        'address',
        'The address (program ID or account address) that will be written to',
        undefined,
        devtoolsTypes.string
    )
    .setAction(async function({ eid, address }) {
        const { connection } = await deriveConnection(eid)
        const fees = await getPrioritizationFees(connection, address)
        console.log('Prioritization Fees:', fees)
    })
