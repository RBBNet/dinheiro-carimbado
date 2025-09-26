const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployDinheiroCarimbado } = require("./helpers/deploy");

describe("Complete End-to-End Deployment Verification", function() {
  it("Should complete the full deployment and verification workflow", async function() {
    console.log("\n🚀 Starting End-to-End Deployment Test");
    console.log("=" .repeat(50));

    // 1. SETUP
    const [owner, legislator, treasury, agency, company] = await ethers.getSigners();
    console.log(`👤 Owner: ${owner.address}`);
    console.log(`🏛️  Legislator: ${legislator.address}`);
    console.log(`💰 Treasury: ${treasury.address}`);
    console.log(`🏢 Agency: ${agency.address}`);
    console.log(`🏭 Company: ${company.address}`);

    // 2. DEPLOY CONTRACT
    console.log("\n📦 STEP 1: Deploying DinheiroCarimbado Contract");
    const dinheiroCarimbado = await deployDinheiroCarimbado(owner);
    const contractAddress = await dinheiroCarimbado.getAddress();
    console.log(`✅ Contract deployed at: ${contractAddress}`);

    // Verify deployment basics
    const code = await ethers.provider.getCode(contractAddress);
    expect(code).to.not.equal("0x");
    expect(await dinheiroCarimbado.owner()).to.equal(owner.address);
    console.log("✅ Deployment verified");

    // 3. VERIFY TOKEN
    console.log("\n🪙 STEP 2: Verifying DCToken");
    const tokenAddress = await dinheiroCarimbado.token();
    console.log(`🪙 DCToken deployed at: ${tokenAddress}`);
    
    const DCToken = await ethers.getContractFactory("DCToken");
    const dcToken = DCToken.attach(tokenAddress);
    
    expect(await dcToken.name()).to.equal("Dinheiro Carimbado Token");
    expect(await dcToken.symbol()).to.equal("DCT");
    console.log("✅ DCToken verified");

    // 4. SIMULATE FRONTEND VALIDATION
    console.log("\n🌐 STEP 3: Simulating Frontend Validation");
    
    // This is exactly what the frontend app.js does
    async function assertContractDeployed(addr) {
      if (!ethers.isAddress(addr)) {
        throw new Error("Endereço do contrato inválido.");
      }
      const code = await ethers.provider.getCode(addr);
      if (!code || code === "0x") {
        throw new Error("Nenhum contrato encontrado nesse endereço na rede atual.");
      }
    }
    
    // Should pass for our contract
    await assertContractDeployed(contractAddress);
    console.log("✅ Frontend address validation passed");
    
    // Test with frontend ABI
    const frontendAbi = [
      "function isLegislator(address) view returns (bool)",
      "function budget(uint16, bytes32) view returns (uint256 cap, uint256 minted)",
      "function getAreas() view returns (bytes32[])",
      "function getBudgetYears() view returns (uint16[])"
    ];
    
    const frontendContract = new ethers.Contract(contractAddress, frontendAbi, owner);
    expect(await frontendContract.isLegislator(legislator.address)).to.be.false;
    console.log("✅ Frontend ABI compatibility verified");

    // 5. SETUP ROLES & AREAS (like deploy.js would do)
    console.log("\n👥 STEP 4: Setting up Roles and Areas");
    
    await dinheiroCarimbado.setLegislator(legislator.address, true);
    await dinheiroCarimbado.setTreasury(treasury.address, true);
    await dinheiroCarimbado.setAgency(agency.address, true);
    
    expect(await dinheiroCarimbado.isLegislator(legislator.address)).to.be.true;
    expect(await dinheiroCarimbado.isTreasury(treasury.address)).to.be.true;
    expect(await dinheiroCarimbado.isAgency(agency.address)).to.be.true;
    console.log("✅ Roles configured");
    
    const saude = ethers.encodeBytes32String("SAUDE");
    const educacao = ethers.encodeBytes32String("EDUCACAO");
    
    await dinheiroCarimbado.addArea(saude);
    await dinheiroCarimbado.addArea(educacao);
    
    expect(await dinheiroCarimbado.isArea(saude)).to.be.true;
    expect(await dinheiroCarimbado.isArea(educacao)).to.be.true;
    console.log("✅ Areas configured");

    // 6. SETUP COMPANY
    console.log("\n🏭 STEP 5: Setting up Company");
    
    // Convert CNPJ string to bytes14 properly
    const cnpjString = "12345678000190";
    const cnpjBytes14 = ethers.zeroPadValue(ethers.toUtf8Bytes(cnpjString), 14);
    
    await dinheiroCarimbado.upsertCompany(company.address, cnpjBytes14, true);
    await dinheiroCarimbado.setCompanyArea(company.address, saude, true);
    
    expect(await dinheiroCarimbado.isCompany(company.address)).to.be.true;
    expect(await dinheiroCarimbado.isCompanyAllowedForArea(company.address, saude)).to.be.true;
    console.log("✅ Company configured");

    // 7. SET BUDGETS
    console.log("\n💰 STEP 6: Setting Budgets");
    
    await dinheiroCarimbado.connect(legislator).setBudget(2024, saude, 1000000);
    await dinheiroCarimbado.connect(legislator).setBudget(2024, educacao, 500000);
    
    const budgetSaude = await dinheiroCarimbado.budget(2024, saude);
    const budgetEducacao = await dinheiroCarimbado.budget(2024, educacao);
    
    expect(budgetSaude[0]).to.equal(1000000n);
    expect(budgetEducacao[0]).to.equal(500000n);
    console.log(`✅ Budget SAUDE 2024: ${budgetSaude[0].toString()}`);
    console.log(`✅ Budget EDUCACAO 2024: ${budgetEducacao[0].toString()}`);

    // 8. SIMULATE AREA DISCOVERY (like frontend does)
    console.log("\n🔍 STEP 7: Simulating Frontend Area Discovery");
    
    const discoveredAreas = await dinheiroCarimbado.getAreas();
    expect(discoveredAreas).to.have.lengthOf(2);
    console.log(`✅ Discovered ${discoveredAreas.length} areas via view function`);

    // 9. TEST ACTUAL WORKFLOW
    console.log("\n💸 STEP 8: Testing Full Workflow");
    
    // Treasury mints to agency
    await dinheiroCarimbado.connect(treasury).mintToAgency(agency.address, saude, 2024, 100000);
    
    let agencyBalance = await dinheiroCarimbado.balanceOfArea(agency.address, saude);
    expect(agencyBalance).to.equal(100000n);
    console.log(`✅ Agency balance after mint: ${agencyBalance.toString()}`);
    
    // Agency pays company
    await dinheiroCarimbado.connect(agency).payCompany(company.address, saude, 50000);
    
    const companyBalance = await dinheiroCarimbado.balanceOfArea(company.address, saude);
    expect(companyBalance).to.equal(50000n);
    console.log(`✅ Company balance after payment: ${companyBalance.toString()}`);
    
    // Check DCToken balance (should be minted to company)
    const dcTokenBalance = await dcToken.balanceOf(company.address);
    expect(dcTokenBalance).to.equal(ethers.parseEther("50000")); // 50000 * 1e18
    console.log(`✅ DCToken balance: ${ethers.formatEther(dcTokenBalance)} DCT`);

    // 10. FINAL VERIFICATION
    console.log("\n🎯 STEP 9: Final State Verification");
    
    const totalSupplyArea = await dinheiroCarimbado.totalSupplyArea(saude);
    expect(totalSupplyArea).to.equal(100000n);
    console.log(`✅ Total supply area SAUDE: ${totalSupplyArea.toString()}`);
    
    const remainingBudget = await dinheiroCarimbado.remaining(2024, saude);
    expect(remainingBudget).to.equal(900000n); // 1000000 - 100000
    console.log(`✅ Remaining budget SAUDE 2024: ${remainingBudget.toString()}`);

    // 11. CONTRACT SIZE AND STATS
    console.log("\n📊 STEP 10: Contract Statistics");
    
    const contractCode = await ethers.provider.getCode(contractAddress);
    const contractSize = (contractCode.length - 2) / 2;
    expect(contractSize).to.be.below(24000); // Ethereum limit
    console.log(`📏 Contract size: ${contractSize} bytes (${((contractSize/24000)*100).toFixed(1)}% of limit)`);
    
    const network = await ethers.provider.getNetwork();
    console.log(`🌐 Network: ${network.name} (Chain ID: ${network.chainId})`);
    
    console.log("\n🎉 END-TO-END TEST COMPLETED SUCCESSFULLY!");
    console.log("=" .repeat(50));
    console.log("📋 SUMMARY:");
    console.log(`   • Contract: ${contractAddress}`);
    console.log(`   • DCToken: ${tokenAddress}`);
    console.log(`   • Network: ${network.name}`);
    console.log(`   • Areas: 2 configured`);
    console.log(`   • Budgets: 2 set for 2024`);
    console.log(`   • Workflow: ✅ Mint → Pay → Verify`);
    console.log(`   • Frontend: ✅ Compatible`);
    console.log(`   • Size: ${contractSize} bytes`);
    
    console.log("\n💡 NEXT STEPS:");
    console.log("1. Copy contract address to frontend/app.js");
    console.log("2. Start local node: npm run node"); 
    console.log("3. Deploy with: npm run deploy:local");
    console.log("4. Start frontend: npm run web");
    console.log("5. Test in browser with MetaMask");
  });
});
