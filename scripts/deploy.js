// Deployment + Initialization seed (roles, areas, companies)
const { ethers } = require("hardhat");
const hre = require("hardhat");
require("dotenv").config();

async function main() {
  const networkName = hre.network.name;
  console.log("Network:", networkName);

  // Sempre pegamos pelo menos um signer (deployer) – nas duas redes agora a lista de accounts vem da config
  const signers = await ethers.getSigners();
  if (!signers.length) throw new Error("Nenhum signer disponível. Verifique DEPLOY_PRIVATE_KEY ou accounts no hardhat.config.js");
  const deployer = signers[0];

  // Helper para normalizar endereço (string ou signer)
  const addrOf = (v) => (typeof v === 'string' ? v : (v && v.address));
  const isAddr = (a) => { try { return !!a && ethers.isAddress(a); } catch { return false; } };

  // Tentar usar variáveis de ambiente se existirem; caso contrário, mapear signers
  const env = {
    owner: process.env.OWNER,
    legislator: process.env.LEGISLATOR,
    treasury: process.env.TREASURY,
    liquidator: process.env.LIQUIDATOR,
    agenciaSaude: process.env.AGENCIA_SAUDE,
    agenciaEducacao: process.env.AGENCIA_EDUCACAO,
    prefeitura1: process.env.PREFEITURA1,
    prefeitura2: process.env.PREFEITURA2,
    empresaSaude1: process.env.EMPRESA_SAUDE1,
    empresaSaude2: process.env.EMPRESA_SAUDE2,
    empresaEducacao1: process.env.EMPRESA_EDUCACAO1,
    empresaEducacao2: process.env.EMPRESA_EDUCACAO2,
  };

  const allEnvPresent = Object.values(env).every(isAddr);

  let owner, legislator, treasury, liquidator,
      agenciaSaude, agenciaEducacao, prefeitura1, prefeitura2,
      empresaSaude1, empresaSaude2, empresaEducacao1, empresaEducacao2;

  if (allEnvPresent) {
    ({ owner, legislator, treasury, liquidator, agenciaSaude, agenciaEducacao, prefeitura1, prefeitura2, empresaSaude1, empresaSaude2, empresaEducacao1, empresaEducacao2 } = env);
    console.log("Usando endereços do .env");
  } else {
    // Fallback: usar signers na ordem disponível
    [ owner, legislator, treasury, liquidator, agenciaSaude, agenciaEducacao, prefeitura1, prefeitura2, empresaSaude1, empresaSaude2, empresaEducacao1, empresaEducacao2 ] = signers;
    console.log("Usando signers locais (nem todos os endereços do .env presentes)");
  }

  // Garantir que o owner para o construtor é o deployer, caso contrário as chamadas owner-only falharão
  if (!isAddr(owner)) owner = deployer.address;
  if (addrOf(owner).toLowerCase() !== deployer.address.toLowerCase()) {
    console.warn("[aviso] OWNER do .env difere do deployer; as chamadas owner-only podem falhar se a chave não estiver carregada.");
  }

  const printMap = [
    ['owner', owner],
    ['legislator', legislator],
    ['treasury', treasury],
    ['liquidator', liquidator],
    ['Ministério da Saúde (agency)', agenciaSaude],
    ['Ministério da Educação (agency)', agenciaEducacao],
    ['Prefeitura1 (agency)', prefeitura1],
    ['Prefeitura2 (agency)', prefeitura2],
    ['EmpresaSaúde1', empresaSaude1],
    ['EmpresaSaúde2', empresaSaude2],
    ['EmpresaEducação1', empresaEducacao1],
    ['EmpresaEducação2', empresaEducacao2],
  ];

  console.log("\n=== Accounts Map ===");
  for (const [label, v] of printMap) {
    console.log(label + ':', addrOf(v));
  }
  console.log('Deployer (tx signer):', deployer.address);

  // Deploy sempre com deployer
  const Factory = await ethers.getContractFactory("DinheiroCarimbado", deployer);
  const c = await Factory.deploy(addrOf(owner));
  await c.waitForDeployment();
  const addr = await c.getAddress();

  const contractOwner = await c.owner();
  console.log("\nConfirmando o owner: ", contractOwner);
  console.log("\nDinheiroCarimbado deployed to:", addr);
  console.log("Token (ERC20) address:", await c.token());

  const SAUDE = ethers.encodeBytes32String("SAUDE");
  const EDUCACAO = ethers.encodeBytes32String("EDUCACAO");
  const toBytes14 = (s14) => {
    const bytes = ethers.toUtf8Bytes(s14);
    if (bytes.length !== 14) throw new Error("CNPJ must be 14 chars");
    return ethers.hexlify(bytes);
  };

  const ownerSigner = contractOwner.toLowerCase() === deployer.address.toLowerCase() ? deployer : deployer; // fallback igual

  async function safe(fn, label) {
    try { 
      console.log(`Executando ${label}...`);
      const tx = await fn(); 
      if (tx && tx.wait) {
        await tx.wait();
        console.log(`✓ ${label} concluído`);
      }
    } catch (e) { 
      console.warn(`✗ Falhou ${label}: ${e.message}`); 
    }
  }

  await safe(() => c.connect(ownerSigner).setLegislator(addrOf(legislator), true), 'setLegislator');
  await safe(() => c.connect(ownerSigner).setTreasury(addrOf(treasury), true), 'setTreasury');
  await safe(() => c.connect(ownerSigner).setAgency(addrOf(agenciaSaude), true, "Ministério da Saúde"), 'setAgency saúde');
  await safe(() => c.connect(ownerSigner).setAgency(addrOf(agenciaEducacao), true, "Ministério da Educação"), 'setAgency educação');
  await safe(() => c.connect(ownerSigner).setAgency(addrOf(prefeitura1), true, "Prefeitura 1"), 'setAgency pref1');
  await safe(() => c.connect(ownerSigner).setAgency(addrOf(prefeitura2), true, "Prefeitura 2"), 'setAgency pref2');
  await safe(() => c.connect(ownerSigner).setLiquidator(addrOf(liquidator), true), 'setLiquidator');

  await safe(() => c.connect(ownerSigner).addArea(SAUDE), 'addArea SAUDE');
  await safe(() => c.connect(ownerSigner).addArea(EDUCACAO), 'addArea EDUCACAO');

  await safe(() => c.connect(ownerSigner).upsertCompany(addrOf(empresaSaude1), toBytes14("11111111111111"), "Empresa Saúde 1", true), 'upsert empSaude1');
  await safe(() => c.connect(ownerSigner).setCompanyArea(addrOf(empresaSaude1), SAUDE, true), 'setCompanyArea empSaude1 SAUDE');

  await safe(() => c.connect(ownerSigner).upsertCompany(addrOf(empresaSaude2), toBytes14("22222222222222"), "Empresa Saúde 2", true), 'upsert empSaude2');
  await safe(() => c.connect(ownerSigner).setCompanyArea(addrOf(empresaSaude2), SAUDE, true), 'setCompanyArea empSaude2 SAUDE');

  await safe(() => c.connect(ownerSigner).upsertCompany(addrOf(empresaEducacao1), toBytes14("33333333333333"), "Empresa Educação 1", true), 'upsert empEdu1');
  await safe(() => c.connect(ownerSigner).setCompanyArea(addrOf(empresaEducacao1), EDUCACAO, true), 'setCompanyArea empEdu1 EDUCACAO');

  await safe(() => c.connect(ownerSigner).upsertCompany(addrOf(empresaEducacao2), toBytes14("44444444444444"), "Empresa Educação 2", true), 'upsert empEdu2');
  await safe(() => c.connect(ownerSigner).setCompanyArea(addrOf(empresaEducacao2), EDUCACAO, true), 'setCompanyArea empEdu2 EDUCACAO');

  console.log("\n=== Seed Summary ===");
  console.log("Contract:", addr);
  console.log("Areas:", "SAUDE", "EDUCACAO");
  console.log("Agencies:", {
    "Ministério da Saúde": addrOf(agenciaSaude),
    "Ministério da Educação": addrOf(agenciaEducacao),
    "Prefeitura 1": addrOf(prefeitura1),
    "Prefeitura 2": addrOf(prefeitura2),
  });
  console.log("Companies:", {
    "Empresa Saúde 1": addrOf(empresaSaude1),
    "Empresa Saúde 2": addrOf(empresaSaude2),
    "Empresa Educação 1": addrOf(empresaEducacao1),
    "Empresa Educação 2": addrOf(empresaEducacao2),
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
