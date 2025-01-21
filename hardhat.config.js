require('@layerzerolabs/devtools-evm-hardhat')
require('dotenv').config()

module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    // Local network configuration
    hardhat: {
      chainId: 31337,  // Default local network chain ID
      accounts: {
        mnemonic: "test test test test test test test test test test test junk", // Default testing mnemonic
        count: 10      // Number of accounts to generate
      }
    },
    
    // Solana Testnet configuration
    solana_testnet: {
      url: "https://api.testnet.solana.com",
      chainId: 103,    // Solana testnet chain ID
      accounts: [process.env.SOLANA_PRIVATE_KEY] // Your private key from .env
    },
    
    // Solana Mainnet configuration
    solana_mainnet: {
      url: "https://api.mainnet-beta.solana.com",
      chainId: 101,    // Solana mainnet chain ID
      accounts: [process.env.SOLANA_PRIVATE_KEY]
    },
    
    // Ethereum Sepolia Testnet (if needed for cross-chain)
    sepolia: {
      url: "https://rpc.sepolia.org",
      chainId: 11155111,
      accounts: [process.env.SOLANA_PRIVATE_KEY]
    }
  },
  
  // Additional network settings
  solana: {
    // Solana-specific configurations
    clusterApiUrl: process.env.ENDPOINT_ID === 'SOLANA_V2_TESTNET' 
      ? "https://api.testnet.solana.com" 
      : "https://api.mainnet-beta.solana.com"
  }
} 