/** @type import('hardhat/config').HardhatUserConfig */
require("dotenv").config();
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomicfoundation/hardhat-toolbox");

function pk(key) {
  if (!key) return undefined;
  return key.startsWith("0x") ? key : `0x${key}`;
}

const deployPk = pk(process.env.DEPLOY_PRIVATE_KEY);
const agenciaSaudePk = pk(process.env.AGENCIA_SAUDE_PRIVATE_KEY);
const agenciaEducacaoPk = pk(process.env.AGENCIA_EDUCACAO_PRIVATE_KEY);

// Para a rede 'hardhat' o formato precisa ser array de objetos { privateKey, balance }
const hardhatAccounts = deployPk ? [{ privateKey: deployPk, balance: "10000000000000000000000" }] : undefined;
// Para redes externas pode ser array de strings (PKs)
const externalAccounts = deployPk ? [deployPk, agenciaSaudePk, agenciaEducacaoPk] : undefined;

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } }
  },
  paths: {
    sources: "./contracts",
    tests: "./test", 
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    hardhat: {
      accounts: hardhatAccounts,
      from: process.env.DEPLOY_ACCOUNT_ADDRESS
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
      accounts: externalAccounts,
      from: process.env.DEPLOY_ACCOUNT_ADDRESS,
      gasPrice: 0,
      initialBaseFeePerGas: 0,
      blockGasLimit: 30000000
    },
    rbblab: {
      url: "http://localhost:8545",
      chainId: 648629,
      accounts: externalAccounts,
      from: process.env.DEPLOY_ACCOUNT_ADDRESS,
      gasPrice: 0,
      blockGasLimit: 30000000
    }
  }
};
