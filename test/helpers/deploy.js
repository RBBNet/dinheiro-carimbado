const { ethers } = require("hardhat");

/**
 * Deploy helper function that can be reused across tests
 */
async function deployDinheiroCarimbado(owner) {
  if (!owner) {
    [owner] = await ethers.getSigners();
  }
  
  const DinheiroCarimbado = await ethers.getContractFactory("DinheiroCarimbado");
  const dinheiroCarimbado = await DinheiroCarimbado.deploy(owner.address);
  await dinheiroCarimbado.waitForDeployment();
  
  return dinheiroCarimbado;
}

/**
 * Get the DCToken instance from the main contract
 */
async function getDCToken(dinheiroCarimbado) {
  const tokenAddress = await dinheiroCarimbado.token();
  const DCToken = await ethers.getContractFactory("DCToken");
  return DCToken.attach(tokenAddress);
}

module.exports = {
  deployDinheiroCarimbado,
  getDCToken
};
