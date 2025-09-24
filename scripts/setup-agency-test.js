// Setup script to create budgets and mint tokens for testing agency transfers
const { ethers } = require("hardhat");

async function main() {
  const contractAddress = "0x68B1D87F95878fE05B998F19b66F4baba5De1aed"; // From deployment
  
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

  // Connect to the deployed contract
  const DinheiroCarimbado = await ethers.getContractFactory("DinheiroCarimbado");
  const contract = DinheiroCarimbado.attach(contractAddress);
  
  // Areas
  const SAUDE = ethers.encodeBytes32String("SAUDE");
  const EDUCACAO = ethers.encodeBytes32String("EDUCACAO");
  
  console.log("Setting up budgets and minting tokens for agency transfer tests...\n");
  
  // Set budgets for 2025
  console.log("1. Setting budgets for 2025...");
  await (await contract.connect(legislator).setBudget(2025, SAUDE, 1000000)).wait();
  await (await contract.connect(legislator).setBudget(2025, EDUCACAO, 800000)).wait();
  console.log("✅ Budgets set: SAUDE=1M, EDUCACAO=800K");
  
  // Mint some tokens to agencies
  console.log("\n2. Minting tokens to agencies...");
  await (await contract.connect(treasury).mintToAgency(agenciaSaude.address, SAUDE, 2025, 300000)).wait();
  await (await contract.connect(treasury).mintToAgency(agenciaEducacao.address, EDUCACAO, 2025, 200000)).wait();
  await (await contract.connect(treasury).mintToAgency(prefeitura1.address, SAUDE, 2025, 150000)).wait();
  await (await contract.connect(treasury).mintToAgency(prefeitura2.address, EDUCACAO, 2025, 100000)).wait();
  console.log("✅ Tokens minted:");
  console.log("   Ministério da Saúde: 300K SAUDE");
  console.log("   Ministério da Educação: 200K EDUCACAO");
  console.log("   Prefeitura 1: 150K SAUDE");
  console.log("   Prefeitura 2: 100K EDUCACAO");
  
  // Check balances
  console.log("\n3. Current balances:");
  const saudeBalance1 = await contract.balanceOfArea(agenciaSaude.address, SAUDE);
  const educacaoBalance1 = await contract.balanceOfArea(agenciaEducacao.address, EDUCACAO);
  const saudeBalance2 = await contract.balanceOfArea(prefeitura1.address, SAUDE);
  const educacaoBalance2 = await contract.balanceOfArea(prefeitura2.address, EDUCACAO);
  
  console.log(`   Ministério da Saúde (${agenciaSaude.address}): ${saudeBalance1} SAUDE`);
  console.log(`   Ministério da Educação (${agenciaEducacao.address}): ${educacaoBalance1} EDUCACAO`);
  console.log(`   Prefeitura 1 (${prefeitura1.address}): ${saudeBalance2} SAUDE`);
  console.log(`   Prefeitura 2 (${prefeitura2.address}): ${educacaoBalance2} EDUCACAO`);
  
  console.log("\n✅ Setup complete! You can now test agency transfers.");
  console.log("\nTest scenarios:");
  console.log("- Connect as Ministério da Saúde and transfer SAUDE to Prefeitura 1");
  console.log("- Connect as Prefeitura 2 and transfer EDUCACAO to Ministério da Educação");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
