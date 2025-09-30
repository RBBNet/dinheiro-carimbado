require('dotenv').config();
const { ethers } = require('hardhat');

async function main() {
  const contractAddress =
    process.env.DC_CONTRACT ||
    process.env.CONTRACT_ADDRESS ||
    '0x5FbDB2315678afecb367f032d93F642f64180aa3'; // fallback hardhat default

  const [signer] = await ethers.getSigners();
  console.log('Signer:', signer.address);
  console.log('Contrato:', contractAddress);

  const DC = await ethers.getContractFactory('DinheiroCarimbado');
  const contract = DC.attach(contractAddress);

  // === Guard: precisa ser owner ===
  let owner;
  try {
    owner = await contract.owner();
  } catch (e) {
    console.error('Não foi possível obter owner():', e.message);
    process.exit(1);
  }
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    console.error('Signer não é o owner. Abortando.');
    process.exit(1);
  }
  console.log('Owner confirmado.');

  // Se ainda não for legislador, torná-lo (owner tem permissão)
  let isLeg = false;
  try {
    isLeg = await contract.isLegislator(signer.address);
  } catch (e) {
    console.error('Falha ao verificar isLegislator:', e.message);
    process.exit(1);
  }
  if (!isLeg) {
    console.log('Signer ainda não é legislador. Registrando...');
    const txLeg = await contract.setLegislator(signer.address, true);
    console.log('  tx setLegislator:', txLeg.hash);
    await txLeg.wait();
    console.log('  legislador confirmado.');
  } else {
    console.log('Signer já é legislador.');
  }

  const year = 2025;
  const areas = ['EDUCACAO', 'SAUDE'];
  const cap = 1_000_000n;

  for (const a of areas) {
    const areaBytes = ethers.encodeBytes32String(a);
    let active = false;
    try {
      active = await contract.isArea(areaBytes);
    } catch (e) {
      console.warn(`Falha ao consultar isArea(${a}): ${e.message}`);
    }
    if (!active) {
      console.warn(`Área ${a} não ativa. Pulando.`);
      continue;
    }
    console.log(`Definindo orçamento ${a} ano ${year} = ${cap}`);
    const tx = await contract.setBudget(year, areaBytes, cap);
    console.log('  tx:', tx.hash);
    await tx.wait();
    console.log('  confirmado.');
  }

  // Resumo
  try {
    const [areasSet, caps, minted, realized] = await contract.getBudgetsForYear(year);
    console.log('\nResumo ano', year);
    for (let i = 0; i < areasSet.length; i++) {
      let name;
      try { name = ethers.decodeBytes32String(areasSet[i]); } catch { name = areasSet[i]; }
      console.log(` - ${name}: cap=${caps[i]} minted=${minted[i]} realized=${realized[i]}`);
    }
  } catch (e) {
    console.warn('Não foi possível obter resumo:', e.message);
  }
}

main().catch((e) => {
  console.error('Erro:', e);
  process.exit(1);
});