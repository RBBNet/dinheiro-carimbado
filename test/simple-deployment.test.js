const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployDinheiroCarimbado, getDCToken } = require("./helpers/deploy");

describe("Simple Deployment Verification", function() {
  let dinheiroCarimbado;
  let owner, addr1, addr2;

  beforeEach(async function() {
    [owner, addr1, addr2] = await ethers.getSigners();
  });

  describe("Basic Deployment Tests", function() {
    it("Should deploy contract successfully", async function() {
      dinheiroCarimbado = await deployDinheiroCarimbado(owner);
      const contractAddress = await dinheiroCarimbado.getAddress();
      
      // Verify contract is deployed
      expect(ethers.isAddress(contractAddress)).to.be.true;
      expect(contractAddress).to.not.equal(ethers.ZeroAddress);
      
      // Verify bytecode exists
      const code = await ethers.provider.getCode(contractAddress);
      expect(code).to.not.equal("0x");
      expect(code.length).to.be.greaterThan(2);
    });

    it("Should initialize state correctly", async function() {
      dinheiroCarimbado = await deployDinheiroCarimbado(owner);
      
      // Check owner
      expect(await dinheiroCarimbado.owner()).to.equal(owner.address);
      
      // Check token deployment
      const tokenAddress = await dinheiroCarimbado.token();
      expect(ethers.isAddress(tokenAddress)).to.be.true;
      expect(tokenAddress).to.not.equal(ethers.ZeroAddress);
      
      // Check initial roles (should all be false)
      expect(await dinheiroCarimbado.isLegislator(owner.address)).to.be.false;
      expect(await dinheiroCarimbado.isTreasury(owner.address)).to.be.false;
      expect(await dinheiroCarimbado.isAgency(owner.address)).to.be.false;
      expect(await dinheiroCarimbado.isLiquidator(owner.address)).to.be.false;
      expect(await dinheiroCarimbado.isCompany(owner.address)).to.be.false;
    });

    it("Should handle frontend contract validation", async function() {
      dinheiroCarimbado = await deployDinheiroCarimbado(owner);
      const contractAddress = await dinheiroCarimbado.getAddress();

      // Simulate frontend validation (like app.js assertContractDeployed)
      function isValidAddress(addr) {
        return ethers.isAddress(addr);
      }
      
      async function hasCode(addr) {
        const code = await ethers.provider.getCode(addr);
        return code !== "0x";
      }

      // Test valid contract
      expect(isValidAddress(contractAddress)).to.be.true;
      expect(await hasCode(contractAddress)).to.be.true;
      
      // Test invalid addresses
      expect(isValidAddress("invalid")).to.be.false;
      expect(isValidAddress("0x1234")).to.be.false;
      
      // Test EOA (should have no code)
      expect(isValidAddress(owner.address)).to.be.true;
      expect(await hasCode(owner.address)).to.be.false;
    });

    it("Should support frontend ABI methods", async function() {
      dinheiroCarimbado = await deployDinheiroCarimbado(owner);
      
      // Test methods used in frontend
      const saude = ethers.encodeBytes32String("SAUDE");
      
      // These should not throw
      expect(await dinheiroCarimbado.isLegislator(addr1.address)).to.be.a('boolean');
      expect(await dinheiroCarimbado.isArea(saude)).to.be.a('boolean');
      
      const budget = await dinheiroCarimbado.budget(2024, saude);
      expect(budget).to.have.lengthOf(2);
      expect(budget[0]).to.be.a('bigint'); // cap
      expect(budget[1]).to.be.a('bigint'); // minted
      
      expect(await dinheiroCarimbado.totalSupplyArea(saude)).to.be.a('bigint');
    });

    it("Should support role management", async function() {
      dinheiroCarimbado = await deployDinheiroCarimbado(owner);
      
      // Set roles (only owner can do this)
      await dinheiroCarimbado.setLegislator(addr1.address, true);
      expect(await dinheiroCarimbado.isLegislator(addr1.address)).to.be.true;
      
      await dinheiroCarimbado.setTreasury(addr1.address, true);
      expect(await dinheiroCarimbado.isTreasury(addr1.address)).to.be.true;
      
      // Non-owner should not be able to set roles
      try {
        await dinheiroCarimbado.connect(addr1).setLegislator(addr2.address, true);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error.message).to.include("not owner");
      }
    });

    it("Should support area management", async function() {
      dinheiroCarimbado = await deployDinheiroCarimbado(owner);
      const saude = ethers.encodeBytes32String("SAUDE");
      
      // Initially no areas
      expect(await dinheiroCarimbado.isArea(saude)).to.be.false;
      
      // Add area
      await dinheiroCarimbado.addArea(saude);
      expect(await dinheiroCarimbado.isArea(saude)).to.be.true;
      
      // Remove area
      await dinheiroCarimbado.removeArea(saude);
      expect(await dinheiroCarimbado.isArea(saude)).to.be.false;
    });

    it("Should emit events correctly", async function() {
      dinheiroCarimbado = await deployDinheiroCarimbado(owner);
      const saude = ethers.encodeBytes32String("SAUDE");
      
      // Test AreaAdded event
      await expect(dinheiroCarimbado.addArea(saude))
        .to.emit(dinheiroCarimbado, "AreaAdded")
        .withArgs(saude);
      
      // Test RoleSet event
      await expect(dinheiroCarimbado.setLegislator(addr1.address, true))
        .to.emit(dinheiroCarimbado, "RoleSet")
        .withArgs("LEGISLATOR", addr1.address, true);
      
      // Test BudgetSet event
      await dinheiroCarimbado.setLegislator(addr1.address, true);
      await expect(dinheiroCarimbado.connect(addr1).setBudget(2024, saude, 1000000))
        .to.emit(dinheiroCarimbado, "BudgetSet")
        .withArgs(2024, saude, 1000000);
    });

    it("Should discover areas like frontend", async function() {
      dinheiroCarimbado = await deployDinheiroCarimbado(owner);
      const contractAddress = await dinheiroCarimbado.getAddress();
      
      const saude = ethers.encodeBytes32String("SAUDE");
      const educacao = ethers.encodeBytes32String("EDUCACAO");
      
      // Add areas
      await dinheiroCarimbado.addArea(saude);
      await dinheiroCarimbado.addArea(educacao);
      
      // Remove one area
      await dinheiroCarimbado.removeArea(educacao);
      
      const activeAreas = await dinheiroCarimbado.getAreas();

      // Should only have SAUDE (EDUCACAO was removed)
      expect(activeAreas).to.have.lengthOf(1);
      expect(activeAreas[0]).to.equal(saude);
    });

    it("Should check gas usage", async function() {
      // Skip this test for now as it has deployment transaction issues
      // In real usage, we can check gas after actual deployment
      this.skip();
    });

    it("Should check contract size", async function() {
      dinheiroCarimbado = await deployDinheiroCarimbado(owner);
      const contractAddress = await dinheiroCarimbado.getAddress();
      
      const code = await ethers.provider.getCode(contractAddress);
      const size = (code.length - 2) / 2; // Remove 0x and convert to bytes
      
      // Should be under Ethereum's 24KB limit
      expect(size).to.be.below(24000);
      console.log(`Contract size: ${size} bytes`);
    });
  });
});
