// Check company setup and allowed areas
const { ethers } = require("hardhat");

async function main() {
  const contractAddress = "0x68B1D87F95878fE05B998F19b66F4baba5De1aed";
  
  const [
    owner,
    legislator,
    treasury,
    liquidator,
    agenciaSaude,
    agenciaEducacao,
    prefeitura1,
    prefeitura2,
    empresaSaude1,
    empresaSaude2,
    empresaEducacao1,
    empresaEducacao2,
  ] = await ethers.getSigners();

  const DinheiroCarimbado = await ethers.getContractFactory("DinheiroCarimbado");
  const contract = DinheiroCarimbado.attach(contractAddress);
  
  const SAUDE = ethers.encodeBytes32String("SAUDE");
  const EDUCACAO = ethers.encodeBytes32String("EDUCACAO");
  
  console.log("Company setup check...\n");
  
  const companies = [
    { name: "Empresa Saúde 1", addr: empresaSaude1.address, expectedArea: SAUDE },
    { name: "Empresa Saúde 2", addr: empresaSaude2.address, expectedArea: SAUDE },
    { name: "Empresa Educação 1", addr: empresaEducacao1.address, expectedArea: EDUCACAO },
    { name: "Empresa Educação 2", addr: empresaEducacao2.address, expectedArea: EDUCACAO },
  ];
  
  for (const company of companies) {
    console.log(`\n${company.name} (${company.addr}):`);
    
    const isCompany = await contract.isCompany(company.addr);
    console.log(`  Is Company: ${isCompany}`);
    
    if (isCompany) {
      try {
        const name = await contract.getCompanyName(company.addr);
        console.log(`  Name: ${name}`);
        
        const allowedForArea = await contract.isCompanyAllowedForArea(company.addr, company.expectedArea);
        console.log(`  Allowed for ${ethers.decodeBytes32String(company.expectedArea)}: ${allowedForArea}`);
        
        const currentBalance = await contract.balanceOfArea(company.addr, company.expectedArea);
        console.log(`  Current Balance: ${currentBalance}`);
      } catch (error) {
        console.log(`  Error getting details: ${error.message}`);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
