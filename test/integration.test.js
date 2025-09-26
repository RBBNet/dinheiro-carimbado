const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployDinheiroCarimbado, getDCToken } = require("./helpers/deploy");

describe("Complete Integration Test - Deploy to Frontend", function() {
  let dinheiroCarimbado;
  let dcToken;
  let contractAddress;
  let owner, legislator, treasury, agency, company;

  before(async function() {
    [owner, legislator, treasury, agency, company] = await ethers.getSigners();
  });

  it("Should complete full deployment and initialization flow", async function() {
    console.log("\n🚀 Starting complete integration test...");
    
    // 1. DEPLOY CONTRACT
    console.log("1. Deploying DinheiroCarimbado contract...");
    dinheiroCarimbado = await deployDinheiroCarimbado(owner);
    contractAddress = await dinheiroCarimbado.getAddress();
    
    console.log(`   ✅ Contract deployed at: ${contractAddress}`);
    
    // Verify deployment
    const code = await ethers.provider.getCode(contractAddress);
    expect(code).to.not.equal("0x");
    expect(await dinheiroCarimbado.owner()).to.equal(owner.address);
    
    // 2. VERIFY TOKEN DEPLOYMENT
    console.log("2. Verifying DCToken deployment...");
    const tokenAddress = await dinheiroCarimbado.token();
    dcToken = await getDCToken(dinheiroCarimbado);
    
    expect(await dcToken.name()).to.equal("Dinheiro Carimbado Token");
    expect(await dcToken.symbol()).to.equal("DCT");
    console.log(`   ✅ DCToken deployed at: ${tokenAddress}`);
    
    // 3. SETUP ROLES (like deploy.js would do)
    console.log("3. Setting up roles...");
    await dinheiroCarimbado.setLegislator(legislator.address, true);
    await dinheiroCarimbado.setTreasury(treasury.address, true);
    await dinheiroCarimbado.setAgency(agency.address, true);
    
    expect(await dinheiroCarimbado.isLegislator(legislator.address)).to.be.true;
    expect(await dinheiroCarimbado.isTreasury(treasury.address)).to.be.true;
    expect(await dinheiroCarimbado.isAgency(agency.address)).to.be.true;
    console.log("   ✅ Roles configured");
    
    // 4. SETUP AREAS (like deploy.js would do)
    console.log("4. Setting up areas...");
    const saude = ethers.encodeBytes32String("SAUDE");
    const educacao = ethers.encodeBytes32String("EDUCACAO");
    
    await dinheiroCarimbado.addArea(saude);
    await dinheiroCarimbado.addArea(educacao);
    
    expect(await dinheiroCarimbado.isArea(saude)).to.be.true;
    expect(await dinheiroCarimbado.isArea(educacao)).to.be.true;
    console.log("   ✅ Areas configured");
    
    // 5. SETUP COMPANY (like deploy.js would do)
    console.log("5. Setting up company...");
    await dinheiroCarimbado.upsertCompany(
      company.address,
      "12345678000190", // CNPJ
      true
    );
    await dinheiroCarimbado.setCompanyArea(company.address, saude, true);
    
    expect(await dinheiroCarimbado.isCompany(company.address)).to.be.true;
    console.log("   ✅ Company configured");
    
    // 6. SET BUDGETS (like legislator would do)
    console.log("6. Setting budgets...");
    await dinheiroCarimbado.connect(legislator).setBudget(2024, saude, 1000000);
    await dinheiroCarimbado.connect(legislator).setBudget(2024, educacao, 500000);
    
    const budgetSaude = await dinheiroCarimbado.budget(2024, saude);
    const budgetEducacao = await dinheiroCarimbado.budget(2024, educacao);
    
    expect(budgetSaude[0]).to.equal(1000000n);
    expect(budgetEducacao[0]).to.equal(500000n);
    console.log("   ✅ Budgets set");
    
    // 7. SIMULATE FRONTEND VALIDATION
    console.log("7. Simulating frontend validation...");
    
    // Frontend's assertContractDeployed function
    async function assertContractDeployed(addr) {
      if (!ethers.isAddress(addr)) {
        throw new Error("Endereço do contrato inválido.");
      }
      const code = await ethers.provider.getCode(addr);
      if (!code || code === "0x") {
        throw new Error("Nenhum contrato encontrado nesse endereço na rede atual.");
      }
    }
    
    await expect(assertContractDeployed(contractAddress)).to.not.be.rejected;
    console.log("   ✅ Contract address validation passed");
    
    // 8. TEST FRONTEND ABI COMPATIBILITY
    console.log("8. Testing frontend ABI compatibility...");
    const frontendAbi = [
      "function isLegislator(address) view returns (bool)",
      "function budget(uint16, bytes32) view returns (uint256 cap, uint256 minted)",
      "function getAreas() view returns (bytes32[])",
      "function getBudgetYears() view returns (uint16[])",
      "function getBudgetsForYear(uint16 ano) view returns (bytes32[] areas, uint256[] caps, uint256[] mintedValues, uint256[] realizedValues)",
      "function setBudget(uint16 ano, bytes32 area, uint256 cap)",
      "event BudgetSet(uint16 indexed ano, bytes32 indexed area, uint256 cap)",
    ];
    
    const frontendContract = new ethers.Contract(contractAddress, frontendAbi, legislator);
    
    // Test all frontend methods
    expect(await frontendContract.isLegislator(legislator.address)).to.be.true;
    const frontendBudget = await frontendContract.budget(2024, saude);
    expect(frontendBudget[0]).to.equal(1000000n);
    const frontendAreas = await frontendContract.getAreas();
    expect(frontendAreas).to.include(saude);
    console.log("   ✅ Frontend ABI compatibility verified");
    
    // 9. SIMULATE AREA DISCOVERY (like frontend does)
    console.log("9. Simulating area discovery...");
    
    const discoveredAreas = await dinheiroCarimbado.getAreas();
    expect(discoveredAreas).to.have.lengthOf(2);
    expect(discoveredAreas).to.include(saude);
    expect(discoveredAreas).to.include(educacao);
    console.log("   ✅ Area discovery working");

    // 10. SIMULATE BUDGET DISCOVERY (like frontend does)
    console.log("10. Simulating budget discovery...");

    const rawYears = await dinheiroCarimbado.getBudgetYears();
    const yearArray = Array.from(rawYears).map((y) => Number(y)).sort();
    expect(yearArray).to.deep.equal([2024]);

    const budgetsFor2024 = await dinheiroCarimbado.getBudgetsForYear(2024);
    const idxSaude = budgetsFor2024.areas.findIndex((a) => a === saude);
    const idxEducacao = budgetsFor2024.areas.findIndex((a) => a === educacao);
    expect(idxSaude).to.be.gte(0);
    expect(idxEducacao).to.be.gte(0);
    expect(budgetsFor2024.caps[idxSaude]).to.equal(1000000n);
    expect(budgetsFor2024.caps[idxEducacao]).to.equal(500000n);
    console.log("   ✅ Budget discovery working");
    
    // 11. TEST TRANSACTION FUNCTIONALITY
    console.log("11. Testing transaction functionality...");
    
    // Add new budget (like frontend would)
    const tx = await frontendContract.setBudget(2025, saude, 2000000);
    await tx.wait();
    
    const newBudget = await frontendContract.budget(2025, saude);
    expect(newBudget[0]).to.equal(2000000n);
    console.log("   ✅ Transaction functionality working");
    
    // 12. VERIFY EVENTS ARE EMITTED
    console.log("12. Verifying events...");
    
    await expect(dinheiroCarimbado.addArea(ethers.encodeBytes32String("INFRAESTRUTURA")))
      .to.emit(dinheiroCarimbado, "AreaAdded");
    
    await expect(dinheiroCarimbado.connect(legislator).setBudget(2025, educacao, 750000))
      .to.emit(dinheiroCarimbado, "BudgetSet")
      .withArgs(2025, educacao, 750000);
    
    console.log("   ✅ Events working correctly");
    
    console.log("\n🎉 Integration test completed successfully!");
    console.log(`📋 Summary:`);
    console.log(`   - Contract: ${contractAddress}`);
    console.log(`   - DCToken: ${tokenAddress}`);
    console.log(`   - Network: ${(await ethers.provider.getNetwork()).name}`);
    console.log(`   - Areas: 3 configured`);
    console.log(`   - Budgets: 4 set across 2 years`);
    console.log(`   - Frontend compatibility: ✅ Verified`);
  });

  it("Should handle error scenarios gracefully", async function() {
    console.log("\n🔧 Testing error scenarios...");
    
    // Test invalid contract address
    async function validateAddress(addr) {
      if (!ethers.isAddress(addr)) {
        throw new Error("Endereço do contrato inválido.");
      }
      const code = await ethers.provider.getCode(addr);
      if (!code || code === "0x") {
        throw new Error("Nenhum contrato encontrado nesse endereço na rede atual.");
      }
    }
    
    // Should fail for invalid addresses
    await expect(validateAddress("invalid-address"))
      .to.be.rejectedWith("Endereço do contrato inválido.");
    
    await expect(validateAddress(owner.address)) // EOA
      .to.be.rejectedWith("Nenhum contrato encontrado");
    
    console.log("   ✅ Error handling working correctly");
  });

  after(function() {
    console.log("\n📊 Final deployment info:");
    console.log(`Contract Address: ${contractAddress}`);
    console.log("This address can be used in the frontend app.js");
    console.log("\n💡 To use in frontend:");
    console.log(`1. Start local node: npm run node`);
    console.log(`2. Deploy contract: npm run deploy:local`);
    console.log(`3. Copy contract address to frontend`);
    console.log(`4. Start frontend: npm run web`);
  });
});
