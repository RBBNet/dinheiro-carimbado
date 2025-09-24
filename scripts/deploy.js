// Deployment + Initialization seed (roles, areas, companies)
const { ethers } = require("hardhat");

async function main() {
  const [
    owner,
    legislator,
    treasury,
    liquidator,
    agenciaSaude,      // Ministério da Saúde
    agenciaEducacao,   // Ministério da Educação
    prefeitura1,       // Prefeitura1
    prefeitura2,       // Prefeitura2
    empresaSaude1,
    empresaSaude2,
    empresaEducacao1,
    empresaEducacao2,
  ] = await ethers.getSigners();

  console.log("\n=== Accounts Map ===");
  console.log("owner:", owner.address);
  console.log("legislator:", legislator.address);
  console.log("treasury:", treasury.address);
  console.log("liquidator:", liquidator.address);
  console.log("Ministério da Saúde (agency):", agenciaSaude.address);
  console.log("Ministério da Educação (agency):", agenciaEducacao.address);
  console.log("Prefeitura1 (agency):", prefeitura1.address);
  console.log("Prefeitura2 (agency):", prefeitura2.address);
  console.log("EmpresaSaúde1:", empresaSaude1.address);
  console.log("EmpresaSaúde2:", empresaSaude2.address);
  console.log("EmpresaEducação1:", empresaEducacao1.address);
  console.log("EmpresaEducação2:", empresaEducacao2.address);

  // Deploy
  const Factory = await ethers.getContractFactory("DinheiroCarimbado");
  const c = await Factory.deploy(owner.address);
  await c.waitForDeployment();
  const addr = await c.getAddress();
  // Chama função de leitura do contrato para garantir que houve deploy. Se não houve, interrompe
  const contractOwner = await c.owner();
  if (!contractOwner) {
    console.error("Falha ao acessar o contrato. Implantação pode ter falhado.");
    process.exit(1);
  }
  else 
    console.log("\nConfirmando o owner: ", contractOwner);

  console.log("\nDinheiroCarimbado deployed to:", addr);
  console.log("Token (ERC20) address:", await c.token());

  // Helper constants
  const SAUDE = ethers.encodeBytes32String("SAUDE");
  const EDUCACAO = ethers.encodeBytes32String("EDUCACAO");
  const toBytes14 = (s14) => {
    const bytes = ethers.toUtf8Bytes(s14);
    if (bytes.length !== 14) throw new Error("CNPJ must be 14 chars");
    return ethers.hexlify(bytes);
  };

  // Set Roles (owner-only)
  await (await c.connect(owner).setLegislator(legislator.address, true)).wait();
  await (await c.connect(owner).setTreasury(treasury.address, true)).wait();

  // Agências: Ministérios primeiro, depois Prefeituras (ordem para facilitar apelidos na carteira)
  await (await c.connect(owner).setAgency(agenciaSaude.address, true, "Ministério da Saúde")).wait();
  await (await c.connect(owner).setAgency(agenciaEducacao.address, true, "Ministério da Educação")).wait();
  await (await c.connect(owner).setAgency(prefeitura1.address, true, "Prefeitura 1")).wait();
  await (await c.connect(owner).setAgency(prefeitura2.address, true, "Prefeitura 2")).wait();

  await (await c.connect(owner).setLiquidator(liquidator.address, true)).wait();
  console.log("Roles set: legislator, treasury, 4 agencies (2 Ministérios, 2 Prefeituras), liquidator.");

  // Add Areas
  await (await c.connect(owner).addArea(SAUDE)).wait();
  await (await c.connect(owner).addArea(EDUCACAO)).wait();
  console.log("Areas added: SAUDE, EDUCACAO.");

  // Upsert Companies (active = true) and enable per area
  await (await c.connect(owner).upsertCompany(empresaSaude1.address, toBytes14("11111111111111"), "Empresa Saúde 1", true)).wait();
  await (await c.connect(owner).setCompanyArea(empresaSaude1.address, SAUDE, true)).wait();

  await (await c.connect(owner).upsertCompany(empresaSaude2.address, toBytes14("22222222222222"), "Empresa Saúde 2", true)).wait();
  await (await c.connect(owner).setCompanyArea(empresaSaude2.address, SAUDE, true)).wait();

  await (await c.connect(owner).upsertCompany(empresaEducacao1.address, toBytes14("33333333333333"), "Empresa Educação 1", true)).wait();
  await (await c.connect(owner).setCompanyArea(empresaEducacao1.address, EDUCACAO, true)).wait();

  await (await c.connect(owner).upsertCompany(empresaEducacao2.address, toBytes14("44444444444444"), "Empresa Educação 2", true)).wait();
  await (await c.connect(owner).setCompanyArea(empresaEducacao2.address, EDUCACAO, true)).wait();

  console.log("Companies added and enabled per area: 2 Saúde, 2 Educação.");

  // Summary
  console.log("\n=== Seed Summary ===");
  console.log("Contract:", addr);
  console.log("Areas:", "SAUDE", "EDUCACAO");
  console.log("Agencies:", {
    "Ministério da Saúde": agenciaSaude.address,
    "Ministério da Educação": agenciaEducacao.address,
    "Prefeitura 1": prefeitura1.address,
    "Prefeitura 2": prefeitura2.address,
  });
  console.log("Companies:", {
    "Empresa Saúde 1": empresaSaude1.address,
    "Empresa Saúde 2": empresaSaude2.address,
    "Empresa Educação 1": empresaEducacao1.address,
    "Empresa Educação 2": empresaEducacao2.address,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
