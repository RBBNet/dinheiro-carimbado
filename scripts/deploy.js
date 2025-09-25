// Deployment + Initialization seed (roles, areas, companies)
const { ethers } = require("hardhat");
const hre = require("hardhat");
require("dotenv").config();

function toAddr(x) {
  return typeof x === "string" ? x : x?.address;
}
function must(str, name) {
  if (!str) throw new Error(`.env missing ${name}`);
  return str;
}
function isAddr(str) {
  try { return !!str && ethers.isAddress(str); } catch { return false; }
}
function toBytes14Strict(s14) {
  const bytes = ethers.toUtf8Bytes(s14);
  if (bytes.length !== 14) throw new Error("CNPJ must have exactly 14 chars");
  return ethers.hexlify(bytes);
}

async function main() {
  const networkName = hre.network.name;
  console.log("Network:", networkName);

  // Common variables that can be string (address) or Signer
  let owner, legislator, treasury, liquidator,
      agenciaSaude, agenciaEducacao, prefeitura1, prefeitura2,
      empresaSaude1, empresaSaude2, empresaEducacao1, empresaEducacao2;

  // Signer to send txs
  let deployer;

  if (networkName === "rbb_lab") {
    // Use addresses from .env (strings)
    const OWNER = must(process.env.OWNER, "OWNER");
    owner = OWNER;
    legislator = process.env.LEGISLATOR;
    treasury = process.env.TREASURY;
    liquidator = process.env.LIQUIDATOR;
    agenciaSaude = process.env.AGENCIA_SAUDE;
    agenciaEducacao = process.env.AGENCIA_EDUCACAO;
    prefeitura1 = process.env.PREFEITURA1;
    prefeitura2 = process.env.PREFEITURA2;
    empresaSaude1 = process.env.EMPRESA_SAUDE1;
    empresaSaude2 = process.env.EMPRESA_SAUDE2;
    empresaEducacao1 = process.env.EMPRESA_EDUCACAO1;
    empresaEducacao2 = process.env.EMPRESA_EDUCACAO2;

    const pk = must(process.env.DEPLOY_PRIVATE_KEY, "DEPLOY_PRIVATE_KEY");
    deployer = new ethers.Wallet(pk, ethers.provider);

    // Avisos sobre variáveis ausentes
    const maybe = (name, v) => { if (!isAddr(v)) console.warn(`(warn) .env ${name} ausente ou inválido`); };
    maybe("LEGISLATOR", legislator);
    maybe("TREASURY", treasury);
    maybe("LIQUIDATOR", liquidator);
    maybe("AGENCIA_SAUDE", agenciaSaude);
    maybe("AGENCIA_EDUCACAO", agenciaEducacao);
    maybe("PREFEITURA1", prefeitura1);
    maybe("PREFEITURA2", prefeitura2);
    maybe("EMPRESA_SAUDE1", empresaSaude1);
    maybe("EMPRESA_SAUDE2", empresaSaude2);
    maybe("EMPRESA_EDUCACAO1", empresaEducacao1);
    maybe("EMPRESA_EDUCACAO2", empresaEducacao2);
  } else {
    // Local networks: use Hardhat signers
    [
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
    deployer = owner; // owner is a Signer here
  }

  const a = (x) => toAddr(x) || "(nd)";

  console.log("\n=== Accounts Map ===");
  console.log("owner:", a(owner));
  console.log("legislator:", a(legislator));
  console.log("treasury:", a(treasury));
  console.log("liquidator:", a(liquidator));
  console.log("Ministério da Saúde (agency):", a(agenciaSaude));
  console.log("Ministério da Educação (agency):", a(agenciaEducacao));
  console.log("Prefeitura1 (agency):", a(prefeitura1));
  console.log("Prefeitura2 (agency):", a(prefeitura2));
  console.log("EmpresaSaúde1:", a(empresaSaude1));
  console.log("EmpresaSaúde2:", a(empresaSaude2));
  console.log("EmpresaEducação1:", a(empresaEducacao1));
  console.log("EmpresaEducação2:", a(empresaEducacao2));
  console.log("deployer (tx sender):", deployer.address);

  // Deploy with deployer; constructor expects owner address (string)
  const Factory = await ethers.getContractFactory("DinheiroCarimbado", deployer);
  const c = await Factory.deploy(toAddr(owner));
  await c.waitForDeployment();
  const addr = await c.getAddress();

  const contractOwner = await c.owner();
  if (!contractOwner) {
    console.error("Falha ao acessar o contrato. Implantação pode ter falhado.");
    process.exit(1);
  } else {
    console.log("\nConfirmando o owner: ", contractOwner);
  }

  console.log("\nDinheiroCarimbado deployed to:", addr);
  console.log("Token (ERC20) address:", await c.token());

  // Helpers
  const SAUDE = ethers.encodeBytes32String("SAUDE");
  const EDUCACAO = ethers.encodeBytes32String("EDUCACAO");

  // Owner-only calls: executed by deployer
  if (isAddr(toAddr(legislator))) await (await c.connect(deployer).setLegislator(toAddr(legislator), true)).wait();
  if (isAddr(toAddr(treasury))) await (await c.connect(deployer).setTreasury(toAddr(treasury), true)).wait();
  if (isAddr(toAddr(liquidator))) await (await c.connect(deployer).setLiquidator(toAddr(liquidator), true)).wait();

  // Agencies (only if address provided)
  if (isAddr(toAddr(agenciaSaude)))     await (await c.connect(deployer).setAgency(toAddr(agenciaSaude), true, "Ministério da Saúde")).wait();
  if (isAddr(toAddr(agenciaEducacao)))  await (await c.connect(deployer).setAgency(toAddr(agenciaEducacao), true, "Ministério da Educação")).wait();
  if (isAddr(toAddr(prefeitura1)))      await (await c.connect(deployer).setAgency(toAddr(prefeitura1), true, "Prefeitura 1")).wait();
  if (isAddr(toAddr(prefeitura2)))      await (await c.connect(deployer).setAgency(toAddr(prefeitura2), true, "Prefeitura 2")).wait();

  console.log("Roles set (onde havia endereço válido).");

  // Areas
  await (await c.connect(deployer).addArea(SAUDE)).wait();
  await (await c.connect(deployer).addArea(EDUCACAO)).wait();
  console.log("Areas added: SAUDE, EDUCACAO.");

  // Companies (only if address provided)
  if (isAddr(toAddr(empresaSaude1))) {
    await (await c.connect(deployer).upsertCompany(toAddr(empresaSaude1), toBytes14Strict("11111111111111"), "Empresa Saúde 1", true)).wait();
    await (await c.connect(deployer).setCompanyArea(toAddr(empresaSaude1), SAUDE, true)).wait();
  }
  if (isAddr(toAddr(empresaSaude2))) {
    await (await c.connect(deployer).upsertCompany(toAddr(empresaSaude2), toBytes14Strict("22222222222222"), "Empresa Saúde 2", true)).wait();
    await (await c.connect(deployer).setCompanyArea(toAddr(empresaSaude2), SAUDE, true)).wait();
  }
  if (isAddr(toAddr(empresaEducacao1))) {
    await (await c.connect(deployer).upsertCompany(toAddr(empresaEducacao1), toBytes14Strict("33333333333333"), "Empresa Educação 1", true)).wait();
    await (await c.connect(deployer).setCompanyArea(toAddr(empresaEducacao1), EDUCACAO, true)).wait();
  }
  if (isAddr(toAddr(empresaEducacao2))) {
    await (await c.connect(deployer).upsertCompany(toAddr(empresaEducacao2), toBytes14Strict("44444444444444"), "Empresa Educação 2", true)).wait();
    await (await c.connect(deployer).setCompanyArea(toAddr(empresaEducacao2), EDUCACAO, true)).wait();
  }

  console.log("Companies added where addresses were provided.");

  // Summary
  console.log("\n=== Seed Summary ===");
  console.log("Contract:", addr);
  console.log("Areas:", "SAUDE", "EDUCACAO");
  console.log("Agencies:", {
    "Ministério da Saúde": a(agenciaSaude),
    "Ministério da Educação": a(agenciaEducacao),
    "Prefeitura 1": a(prefeitura1),
    "Prefeitura 2": a(prefeitura2),
  });
  console.log("Companies:", {
    "Empresa Saúde 1": a(empresaSaude1),
    "Empresa Saúde 2": a(empresaSaude2),
    "Empresa Educação 1": a(empresaEducacao1),
    "Empresa Educação 2": a(empresaEducacao2),
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
