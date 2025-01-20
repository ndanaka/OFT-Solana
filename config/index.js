// Configuration for OFT deployment and operations
export const config = {
    // Environment
    SOLANA_PRIVATE_KEY: process.env.SOLANA_PRIVATE_KEY, // Keep this in .env file for security

    // Network and Endpoint Configuration
    endpointId: EndpointId.SOLANA_V2_TESTNET, // or SOLANA_V2_MAINNET
    destinationEndpointId: EndpointId.SEPOLIA_V2_TESTNET, // for cross-chain transfers

    // Token Configuration
    tokenConfig: {
        name: "MockOFT",
        symbol: "MOFT",
        decimals: 9, // localDecimals
        sharedDecimals: 6,
        initialSupply: 1000000, // optional, for initial minting
        uri: "", // metadata URI
        sellerFeeBasisPoints: 0,
        tokenMetadataIsMutable: true,
    },

    // Program and Authority Configuration
    programId: "your_program_id_here",
    mint: "", // required for MABA only
    tokenProgram: TOKEN_PROGRAM_ID.toBase58(),
    additionalMinters: [], // array of additional minter public keys
    onlyOftStore: false,

    // Rate Limiting Configuration
    rateLimits: {
        capacity: BigInt(1000000),
        refillPerSecond: BigInt(100),
    },

    // Transaction Configuration
    computeUnitPriceScaleFactor: 4,
}

// Optional: Add environment-specific configurations
export const getConfig = (environment = 'testnet') => {
    const baseConfig = { ...config }
    
    switch (environment) {
        case 'mainnet':
            return {
                ...baseConfig,
                endpointId: EndpointId.SOLANA_V2_MAINNET,
                destinationEndpointId: EndpointId.ETHEREUM_V2_MAINNET,
            }
        case 'testnet':
        default:
            return baseConfig
    }
}