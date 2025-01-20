import { Connection, PublicKey } from '@solana/web3.js'
import { backOff } from 'exponential-backoff'

/**
 * Assert that the account is initialized on the Solana blockchain.  Due to eventual consistency, there is a race
 * between account creation and initialization.  This function will retry 10 times with backoff to ensure the account is
 * initialized.
 * @param {Connection} connection
 * @param {PublicKey} publicKey
 */
export const assertAccountInitialized = async (connection, publicKey) => {
    return backOff(
        async () => {
            const accountInfo = await connection.getAccountInfo(publicKey)
            if (!accountInfo) {
                throw new Error('Multisig account not found')
            }
            return accountInfo
        },
        {
            maxDelay: 30000,
            numOfAttempts: 10,
            startingDelay: 5000,
        }
    )
}
