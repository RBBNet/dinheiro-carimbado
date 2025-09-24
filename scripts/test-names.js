// Simple verification script to test agency names
const { ethers } = require("hardhat");

async function main() {
  const contractAddress = "0x68B1D87F95878fE05B998F19b66F4baba5De1aed"; // From deployment
  
  // Connect to the deployed contract
  const DinheiroCarimbado = await ethers.getContractFactory("DinheiroCarimbado");
  const contract = DinheiroCarimbado.attach(contractAddress);
  
  console.log("Testing agency names...\n");
  
  // Test addresses from deployment
  const agencies = [
    { addr: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", expected: "Ministério da Saúde" },
    { addr: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc", expected: "Ministério da Educação" },
    { addr: "0x976EA74026E726554dB657fA54763abd0C3a0aa9", expected: "Prefeitura 1" },
    { addr: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955", expected: "Prefeitura 2" },
  ];
  
  for (const agency of agencies) {
    try {
      const isAgency = await contract.isAgency(agency.addr);
      const name = await contract.agencyNames(agency.addr);
      
      console.log(`Address: ${agency.addr}`);
      console.log(`Is Agency: ${isAgency}`);
      console.log(`Name: "${name}"`);
      console.log(`Expected: "${agency.expected}"`);
      console.log(`✅ Match: ${name === agency.expected}`);
      console.log("---");
    } catch (error) {
      console.log(`❌ Error testing ${agency.addr}:`, error.message);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
