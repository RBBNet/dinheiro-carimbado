const fs = require('fs');
const path = require('path');
const { ethers } = require('hardhat');

async function main() {
  // Caminho do CSV
  const csvPath = path.join(__dirname, '../data/cadastros_empresa.csv');
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.trim().split('\n');
  const header = lines[0].split(',');

  // Instancia contrato
  if (process.env.DC_CONTRACT === undefined) {
    console.log("Usando o default para endereço do contrato");
  }
  else
    console.log("Usando DC_CONTRACT do .env:", process.env.DC_CONTRACT);
  
  const contractAddress = process.env.DC_CONTRACT || '0x5FbDB2315678afecb367f032d93F642f64180aa3';
  const [deployer] = await ethers.getSigners();
  const DC = await ethers.getContractFactory('DinheiroCarimbado');
  const contract = DC.attach(contractAddress);

  for (let i = 1; i < lines.length; i++) {
    const [address, cnpj, nome, area] = lines[i].split(',');
    // CNPJ para bytes14
    const cnpjBytes = ethers.zeroPadValue(ethers.toUtf8Bytes(cnpj), 14);
    // Área para bytes32
    const areaBytes = ethers.encodeBytes32String(area.trim().toUpperCase());
    // Chama cadastro
    console.log(`Cadastrando: ${nome} (${address}) - CNPJ: ${cnpj} - Área: ${area}`);
    const tx = await contract.upsertCompany(address, cnpjBytes, nome, true);
    await tx.wait();
    const tx2 = await contract.setCompanyArea(address, areaBytes, true);
    await tx2.wait();
  }
  console.log('Cadastro de empresas concluído!');
}

main().catch((err) => {
  console.error('Erro ao cadastrar empresas:', err);
  process.exit(1);
});
