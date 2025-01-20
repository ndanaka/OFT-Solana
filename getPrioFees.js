import { task } from 'hardhat/config'

import { types as devtoolsTypes } from '@layerzerolabs/devtools-evm-hardhat'
import { EndpointId } from '@layerzerolabs/lz-definitions'

import getPrioritizationFees from '../utils/getFee'

import { deriveConnection } from './index'

task('lz:solana:get-priority-fees', 'Fetches prioritization fees from the Solana network')
    .addParam('eid', 'The endpoint ID for the Solana network', process.env.ENDPOINT_ID, devtoolsTypes.eid)
    .addOptionalParam('address', 'The address (program ID or account address)', process.env.ADDRESS, devtoolsTypes.string)
    .setAction(async function(args) {
        const { connection } = await deriveConnection(args.eid)
        const fees = await getPrioritizationFees(connection, args.address)
        console.log('Prioritization Fees:', fees)
    })
