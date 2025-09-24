// Test agency transfer function directly
const { ethers } = require("hardhat");

async function main() {
  const contractAddress = "0x68B1D87F95878fE05B998F19b66F4baba5De1aed";
  
  const [
    owner,
    legislator,
    treasury,
    liquidator,
    agenciaSaude,      // Ministério da Saúde (has 800K SAUDE)
    agenciaEducacao,   // Ministério da Educação (has 600K EDUCACAO)
    prefeitura1,       // Prefeitura 1 (has 150K SAUDE)
    prefeitura2,       // Prefeitura 2 (has 100K EDUCACAO)
  ] = await ethers.getSigners();

  const DinheiroCarimbado = await ethers.getContractFactory("DinheiroCarimbado");
  const contract = DinheiroCarimbado.attach(contractAddress);
  
  const SAUDE = ethers.encodeBytes32String("SAUDE");
  
  console.log("Testing agency transfer...\n");
  
  // Test: Ministério da Saúde transfers 100K SAUDE to Prefeitura 1
  console.log("Before transfer:");
  const saudeBefore1 = await contract.balanceOfArea(agenciaSaude.address, SAUDE);
  const saudeBefore2 = await contract.balanceOfArea(prefeitura1.address, SAUDE);
  console.log(`  Ministério da Saúde: ${saudeBefore1} SAUDE`);
  console.log(`  Prefeitura 1: ${saudeBefore2} SAUDE`);
  
  console.log("\nExecuting transfer: 100,000 SAUDE from Ministério da Saúde to Prefeitura 1...");
  const tx = await contract.connect(agenciaSaude).transferAgencyToAgency(prefeitura1.address, SAUDE, 100000);
  await tx.wait();
  console.log(`✅ Transaction hash: ${tx.hash}`);
  
  console.log("\nAfter transfer:");
  const saudeAfter1 = await contract.balanceOfArea(agenciaSaude.address, SAUDE);
  const saudeAfter2 = await contract.balanceOfArea(prefeitura1.address, SAUDE);
  console.log(`  Ministério da Saúde: ${saudeAfter1} SAUDE`);
  console.log(`  Prefeitura 1: ${saudeAfter2} SAUDE`);
  
  console.log("\n✅ Transfer test completed successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
