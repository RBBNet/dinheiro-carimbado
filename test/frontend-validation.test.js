const chai = require("chai");
const chaiAsPromised = require("chai-as-promised");
const { ethers } = require("hardhat");
const { deployDinheiroCarimbado, getDCToken } = require("./helpers/deploy");

// Enable chai-as-promised
chai.use(chaiAsPromised);
const { expect } = chai;

describe("Frontend Contract Validation", function() {
  let dinheiroCarimbado;
  let contractAddress;
  let owner, legislator, treasury;

  before(async function() {
    [owner, legislator, treasury] = await ethers.getSigners();
    
    // Deploy the contract once for all tests
    dinheiroCarimbado = await deployDinheiroCarimbado(owner);
    contractAddress = await dinheiroCarimbado.getAddress();
  });

  describe("Contract Address Validation", function() {
    it("Should validate contract address format", function() {
      // Valid addresses
      expect(ethers.isAddress(contractAddress)).to.be.true;
      expect(ethers.isAddress("0x1234567890123456789012345678901234567890")).to.be.true;
      
      // Invalid addresses
      expect(ethers.isAddress("0x1234")).to.be.false;
      expect(ethers.isAddress("not-an-address")).to.be.false;
      expect(ethers.isAddress("")).to.be.false;
      expect(ethers.isAddress(null)).to.be.false;
    });

    it("Should detect contract bytecode presence", async function() {
      // Real contract should have bytecode
      const code = await ethers.provider.getCode(contractAddress);
      expect(code).to.not.equal("0x");
      expect(code.length).to.be.greaterThan(2);
      
      // EOA should not have bytecode
      const eoaCode = await ethers.provider.getCode(owner.address);
      expect(eoaCode).to.equal("0x");
    });
  });

  describe("Frontend Integration Simulation", function() {
    it("Should simulate complete frontend initialization flow", async function() {
      // Simulate the frontend's assertContractDeployed function
      async function assertContractDeployed(addr) {
        if (!ethers.isAddress(addr)) {
          throw new Error("Endereço do contrato inválido.");
        }
        const code = await ethers.provider.getCode(addr);
        if (!code || code === "0x") {
          throw new Error("Nenhum contrato encontrado nesse endereço na rede atual.");
        }
      }

      // Should work with valid deployed contract
      await expect(assertContractDeployed(contractAddress)).to.not.be.rejected;

      // Create contract instance like frontend does
        const minimalAbi = [
          "function isLegislator(address) view returns (bool)",
          "function isArea(bytes32) view returns (bool)",
          "function budget(uint16, bytes32) view returns (uint256 cap, uint256 minted)",
          "function getAreas() view returns (bytes32[])",
          "function getBudgetYears() view returns (uint16[])",
          "function getBudgetsForYear(uint16 ano) view returns (bytes32[] areas, uint256[] caps, uint256[] mintedValues, uint256[] realizedValues)",
          "function setBudget(uint16 ano, bytes32 area, uint256 cap)",
        ];

      const frontendContract = new ethers.Contract(contractAddress, minimalAbi, owner);

      // Test basic functionality like frontend would
      expect(await frontendContract.isLegislator(owner.address)).to.be.false;
      
      const saude = ethers.encodeBytes32String("SAUDE");
      expect(await frontendContract.isArea(saude)).to.be.false;
      
      const budget = await frontendContract.budget(2024, saude);
      expect(budget[0]).to.equal(0n); // cap
      expect(budget[1]).to.equal(0n); // minted
    });

    it("Should handle ABI compatibility checks", async function() {
      // Test with correct ABI
      const correctAbi = [
        "function isLegislator(address) view returns (bool)",
      ];
      
      const contractWithCorrectAbi = new ethers.Contract(contractAddress, correctAbi, owner);
      
      // This should work
      await expect(contractWithCorrectAbi.isLegislator(owner.address)).to.not.be.rejected;

      // Test with incorrect ABI (method that doesn't exist)
      const incorrectAbi = [
        "function nonExistentMethod() view returns (bool)",
      ];
      
      const contractWithIncorrectAbi = new ethers.Contract(contractAddress, incorrectAbi, owner);
      
      // This should fail when called
      await expect(contractWithIncorrectAbi.nonExistentMethod()).to.be.rejected;
    });

    it("Should simulate area discovery like frontend", async function() {
      // Setup: add some areas to generate state changes
      const saude = ethers.encodeBytes32String("SAUDE");
      const educacao = ethers.encodeBytes32String("EDUCACAO");

      await dinheiroCarimbado.addArea(saude);
      await dinheiroCarimbado.addArea(educacao);
      await dinheiroCarimbado.removeArea(educacao); // Remove to test filtering

      // Simulate frontend's discoverAreas function using contract call
      async function discoverAreas(contractInstance) {
        const areas = await contractInstance.getAreas();
        return Array.from(areas);
      }

      const discoveredAreas = await discoverAreas(dinheiroCarimbado);
      
      // Should find SAUDE but not EDUCACAO (was removed)
      expect(discoveredAreas).to.have.lengthOf(1);
      expect(discoveredAreas[0]).to.equal(saude);
    });

    it("Should simulate budget discovery like frontend", async function() {
      // Setup: create some budgets
      const saude = ethers.encodeBytes32String("SAUDE");
      await dinheiroCarimbado.setLegislator(legislator.address, true);
      await dinheiroCarimbado.connect(legislator).setBudget(2024, saude, 1000000);
      await dinheiroCarimbado.connect(legislator).setBudget(2025, saude, 2000000);

      // Simulate budget discovery like frontend using helper views
      const rawYears = await dinheiroCarimbado.getBudgetYears();
      const budgetYears = Array.from(rawYears).map((y) => Number(y)).sort();
      expect(budgetYears).to.deep.equal([2024, 2025]);

      const budgets2024 = await dinheiroCarimbado.getBudgetsForYear(2024);
      const idx2024 = budgets2024.areas.findIndex((a) => a === saude);
      expect(idx2024).to.be.gte(0);
      expect(budgets2024.caps[idx2024]).to.equal(1000000n);

      const budgets2025 = await dinheiroCarimbado.getBudgetsForYear(2025);
      const idx2025 = budgets2025.areas.findIndex((a) => a === saude);
      expect(idx2025).to.be.gte(0);
      expect(budgets2025.caps[idx2025]).to.equal(2000000n);
    });
  });

  describe("Error Handling", function() {
    it("Should handle invalid contract addresses gracefully", async function() {
      async function validateAndConnect(addr) {
        // Mimic frontend validation
        if (!ethers.isAddress(addr)) {
          throw new Error("Endereço do contrato inválido.");
        }
        
        const code = await ethers.provider.getCode(addr);
        if (!code || code === "0x") {
          throw new Error("Nenhum contrato encontrado nesse endereço na rede atual.");
        }

        // Try to create contract instance and call a method
        const testAbi = ["function isLegislator(address) view returns (bool)"];
        const contract = new ethers.Contract(addr, testAbi, owner);
        
        try {
          await contract.isLegislator(owner.address);
          return contract;
        } catch (error) {
          throw new Error("Contrato incompatível com a ABI esperada (isLegislator). Verifique se o endereço e a rede estão corretos.");
        }
      }

      // Valid contract should work
      const validContract = await validateAndConnect(contractAddress);
      expect(validContract).to.not.be.undefined;

      // Invalid address format
      await expect(validateAndConnect("invalid"))
        .to.be.rejectedWith("Endereço do contrato inválido.");

      // Valid address but no contract
      await expect(validateAndConnect(owner.address))
        .to.be.rejectedWith("Nenhum contrato encontrado");

      // Valid address with wrong contract (simulate)
      // This would need a different contract deployed to test properly
    });

    it("Should handle network changes gracefully", async function() {
      const network = await ethers.provider.getNetwork();
      expect(network.chainId).to.equal(31337n); // Hardhat local network

      // Contract should work on current network
      expect(await dinheiroCarimbado.owner()).to.equal(owner.address);

      // Simulate what happens when network changes
      // In real scenario, the contract address might not exist on new network
      const code = await ethers.provider.getCode(contractAddress);
      expect(code).to.not.equal("0x");
    });
  });
});
