// Test agency payment to company
const { ethers } = require("hardhat");

async function main() {
  const contractAddress = "0x68B1D87F95878fE05B998F19b66F4baba5De1aed";
  
  const [
    owner,
    legislator,
    treasury,
    liquidator,
    agenciaSaude,      // Ministério da Saúde (has 600K SAUDE)
    agenciaEducacao,   // Ministério da Educação (has 600K EDUCACAO)
    prefeitura1,       // Prefeitura 1 (has 350K SAUDE)
    prefeitura2,       // Prefeitura 2 (has 100K EDUCACAO)
    empresaSaude1,     // Empresa Saúde 1
    empresaSaude2,     // Empresa Saúde 2
    empresaEducacao1,  // Empresa Educação 1
    empresaEducacao2,  // Empresa Educação 2
  ] = await ethers.getSigners();

  const DinheiroCarimbado = await ethers.getContractFactory("DinheiroCarimbado");
  const contract = DinheiroCarimbado.attach(contractAddress);
  
  const SAUDE = ethers.encodeBytes32String("SAUDE");
  const EDUCACAO = ethers.encodeBytes32String("EDUCACAO");
  
  console.log("Testing agency payment to company...\n");
  
  // Check current state
  console.log("Before payment:");
  const agencyBalance = await contract.balanceOfArea(agenciaSaude.address, SAUDE);
  const companyBalance = await contract.balanceOfArea(empresaSaude1.address, SAUDE);
  console.log(`  Ministério da Saúde: ${agencyBalance} SAUDE`);
  console.log(`  Empresa Saúde 1: ${companyBalance} SAUDE`);
  
  // Check if company is allowed for area
  const isAllowed = await contract.isCompanyAllowedForArea(empresaSaude1.address, SAUDE);
  console.log(`  Empresa Saúde 1 allowed for SAUDE: ${isAllowed}`);
  
  // Get company name
  const companyName = await contract.getCompanyName(empresaSaude1.address);
  console.log(`  Company name: ${companyName}`);
  
  // Test payment: 50,000 SAUDE from Ministério da Saúde to Empresa Saúde 1
  console.log("\nExecuting payment: 50,000 SAUDE from Ministério da Saúde to Empresa Saúde 1...");
  const tx = await contract.connect(agenciaSaude).payCompany(empresaSaude1.address, SAUDE, 50000);
  await tx.wait();
  console.log(`✅ Transaction hash: ${tx.hash}`);
  
  console.log("\nAfter payment:");
  const agencyBalanceAfter = await contract.balanceOfArea(agenciaSaude.address, SAUDE);
  const companyBalanceAfter = await contract.balanceOfArea(empresaSaude1.address, SAUDE);
  console.log(`  Ministério da Saúde: ${agencyBalanceAfter} SAUDE`);
  console.log(`  Empresa Saúde 1: ${companyBalanceAfter} SAUDE`);
  
  // Check DCT token balance
  const tokenAddr = await contract.token();
  const DCToken = await ethers.getContractFactory("DCToken");
  const token = DCToken.attach(tokenAddr);
  const tokenBalance = await token.balanceOf(empresaSaude1.address);
  console.log(`  Empresa Saúde 1 DCT tokens: ${ethers.formatEther(tokenBalance)} DCT`);
  
  console.log("\n✅ Payment test completed successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
