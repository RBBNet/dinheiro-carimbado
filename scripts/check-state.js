// Check current budget and agency balances
const { ethers } = require("hardhat");

async function main() {
  const contractAddress = "0x68B1D87F95878fE05B998F19b66F4baba5De1aed";
  
  const [
    owner,
    legislator,
    treasury,
    liquidator,
    agenciaSaude,      // Ministério da Saúde
    agenciaEducacao,   // Ministério da Educação
    prefeitura1,       // Prefeitura 1
    prefeitura2,       // Prefeitura 2
  ] = await ethers.getSigners();

  const DinheiroCarimbado = await ethers.getContractFactory("DinheiroCarimbado");
  const contract = DinheiroCarimbado.attach(contractAddress);
  
  const SAUDE = ethers.encodeBytes32String("SAUDE");
  const EDUCACAO = ethers.encodeBytes32String("EDUCACAO");
  
  console.log("Current state check...\n");
  
  // Check budgets
  const saudeBudget = await contract.budget(2025, SAUDE);
  const educacaoBudget = await contract.budget(2025, EDUCACAO);
  
  console.log("Budgets for 2025:");
  console.log(`  SAUDE: cap=${saudeBudget.cap}, minted=${saudeBudget.minted}`);
  console.log(`  EDUCACAO: cap=${educacaoBudget.cap}, minted=${educacaoBudget.minted}`);
  
  // Check balances
  console.log("\nCurrent agency balances:");
  const agencies = [
    { name: "Ministério da Saúde", addr: agenciaSaude.address },
    { name: "Ministério da Educação", addr: agenciaEducacao.address },
    { name: "Prefeitura 1", addr: prefeitura1.address },
    { name: "Prefeitura 2", addr: prefeitura2.address },
  ];
  
  for (const agency of agencies) {
    const saudeBalance = await contract.balanceOfArea(agency.addr, SAUDE);
    const educacaoBalance = await contract.balanceOfArea(agency.addr, EDUCACAO);
    console.log(`  ${agency.name}:`);
    console.log(`    SAUDE: ${saudeBalance}`);
    console.log(`    EDUCACAO: ${educacaoBalance}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
