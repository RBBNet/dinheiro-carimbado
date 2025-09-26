const { expect } = require("chai");
const { ethers } = require("hardhat");
const { verifyContractDeployment } = require("../scripts/verify-deployment");

describe("scripts/verify-deployment.js", function () {
  it("faz deploy efêmero e verifica com sucesso", async function () {
    const res = await verifyContractDeployment();
    expect(res.success).to.equal(true);
    expect(res.contractAddress).to.match(/^0x[0-9a-fA-F]{40}$/);
    expect(res.tokenAddress).to.match(/^0x[0-9a-fA-F]{40}$/);
  });

  it("falha para endereço sem contrato", async function () {
    const { ethers } = require("hardhat");
    const bogus = ethers.Wallet.createRandom().address;
    const res = await verifyContractDeployment(bogus);
    expect(res.success).to.equal(false);
    expect(res.error).to.match(/contrato/i);
  });
});

describe("Presença de bytecode", function () {
  it("tem bytecode no endereço implantado", async function () {
    const [deployer] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("DinheiroCarimbado");
    const c = await Factory.deploy(deployer.address);
    await c.waitForDeployment();
    const addr = await c.getAddress();
    const code = await ethers.provider.getCode(addr);
    expect(code).to.be.a("string");
    expect(code).to.not.equal("0x");
  });

  it("não tem bytecode em EOA aleatório", async function () {
    const eoa = ethers.Wallet.createRandom().address;
    const code = await ethers.provider.getCode(eoa);
    expect(code).to.equal("0x");
  });
});
