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
    hardhat: {},
    rbb_lab: {
      url: "http://localhost:8545",
      chainId: 648629,
      accounts: deployPk ? [deployPk] : [],
      from: process.env.DEPLOY_ACCOUNT_ADDRESS
    }
  }
};
