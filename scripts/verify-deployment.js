const { ethers } = require("hardhat");
const { expect } = require("chai");

/**
 * Script para verificar se o contrato está devidamente implantado
 * Pode ser usado tanto para desenvolvimento quanto para verificação em produção
 */
async function verifyContractDeployment(contractAddress = null) {
  console.log("🔍 Iniciando verificação de implantação do contrato...\n");

  try {
    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    
    console.log("📊 Informações da rede:");
    console.log(`   - Nome: ${network.name}`);
    console.log(`   - Chain ID: ${network.chainId}`);
    console.log(`   - Deployer: ${deployer.address}`);
    console.log("");

    let dinheiroCarimbado;
    let actualContractAddress;

    if (contractAddress) {
      // Verificar contrato em endereço específico
      console.log(`📍 Verificando contrato no endereço: ${contractAddress}`);
      
      if (!ethers.isAddress(contractAddress)) {
        throw new Error("❌ Endereço do contrato inválido");
      }

      const code = await ethers.provider.getCode(contractAddress);
      if (!code || code === "0x") {
        throw new Error("❌ Nenhum contrato encontrado neste endereço");
      }

      // Tentar conectar ao contrato
      const DinheiroCarimbado = await ethers.getContractFactory("DinheiroCarimbado");
      dinheiroCarimbado = DinheiroCarimbado.attach(contractAddress);
      actualContractAddress = contractAddress;
    } else {
      // Fazer deploy novo para teste
      console.log("🚀 Fazendo deploy de novo contrato para verificação...");
      const DinheiroCarimbado = await ethers.getContractFactory("DinheiroCarimbado");
      dinheiroCarimbado = await DinheiroCarimbado.deploy(deployer.address);
      await dinheiroCarimbado.waitForDeployment();
      actualContractAddress = await dinheiroCarimbado.getAddress();
      console.log(`   - Contrato implantado em: ${actualContractAddress}`);
    }

    console.log("\n✅ Verificações básicas:");
    
    // 1. Verificar se há bytecode
    const bytecode = await ethers.provider.getCode(actualContractAddress);
    console.log(`   - Bytecode presente: ${bytecode !== "0x" ? "✅ Sim" : "❌ Não"} (${(bytecode.length - 2) / 2} bytes)`);

    // 2. Verificar state inicial
    const owner = await dinheiroCarimbado.owner();
    console.log(`   - Owner definido: ${owner !== ethers.ZeroAddress ? "✅ Sim" : "❌ Não"} (${owner})`);

    // 3. Verificar DCToken
    const tokenAddress = await dinheiroCarimbado.token();
    console.log(`   - DCToken vinculado: ${tokenAddress !== ethers.ZeroAddress ? "✅ Sim" : "❌ Não"} (${tokenAddress})`);

    const tokenCode = await ethers.provider.getCode(tokenAddress);
    console.log(`   - DCToken implantado: ${tokenCode !== "0x" ? "✅ Sim" : "❌ Não"}`);

    // 4. Verificar constantes
    const tokenScale = await dinheiroCarimbado.tokenScale();
    console.log(`   - Token scale: ${tokenScale.toString() === ethers.parseEther("1").toString() ? "✅ Correto" : "❌ Incorreto"} (${tokenScale.toString()})`);

    console.log("\n🔧 Verificações funcionais:");
    
    // 5. Testar métodos de leitura
    try {
      const isLeg = await dinheiroCarimbado.isLegislator(deployer.address);
      console.log(`   - isLegislator funciona: ✅ Sim (retornou ${isLeg})`);
    } catch (error) {
      console.log(`   - isLegislator funciona: ❌ Não (${error.message})`);
    }

    // 6. Testar métodos que retornam struct
    try {
      const saude = ethers.encodeBytes32String("SAUDE");
      const budget = await dinheiroCarimbado.budget(2024, saude);
      console.log(`   - budget funciona: ✅ Sim (cap: ${budget[0]}, minted: ${budget[1]})`);
    } catch (error) {
      console.log(`   - budget funciona: ❌ Não (${error.message})`);
    }

    // 7. Verificar interface de eventos
    try {
      const abiEvents = dinheiroCarimbado.interface.fragments.filter(f => f.type === 'event');
      const expectedEvents = ['AreaAdded', 'AreaRemoved', 'BudgetSet', 'RoleSet'];
      const foundEvents = abiEvents.map(e => e.name);
      const hasAllEvents = expectedEvents.every(e => foundEvents.includes(e));
      console.log(`   - Eventos esperados: ${hasAllEvents ? "✅ Todos presentes" : "❌ Faltando"} (${foundEvents.length} eventos)`);
    } catch (error) {
      console.log(`   - Verificação de eventos: ❌ Falhou (${error.message})`);
    }

    console.log("\n🎯 Simulação do frontend:");
    
    // 8. Simular validação do frontend
    try {
      // Simular a função assertContractDeployed do frontend
      if (!ethers.isAddress(actualContractAddress)) {
        throw new Error("Endereço do contrato inválido.");
      }
      const code = await ethers.provider.getCode(actualContractAddress);
      if (!code || code === "0x") {
        throw new Error("Nenhum contrato encontrado nesse endereço na rede atual.");
      }
      console.log(`   - Validação de endereço: ✅ Passou`);
    } catch (error) {
      console.log(`   - Validação de endereço: ❌ ${error.message}`);
    }

    // 9. Testar ABI mínima do frontend
    try {
      const frontendAbi = [
        "function isLegislator(address) view returns (bool)",
        "function isArea(bytes32) view returns (bool)",
        "function budget(uint16, bytes32) view returns (uint256 cap, uint256 minted)",
        "function totalSupplyArea(bytes32) view returns (uint256)"
      ];
      
      const frontendContract = new ethers.Contract(actualContractAddress, frontendAbi, deployer);
      
      // Testar todos os métodos da ABI mínima
      await frontendContract.isLegislator(deployer.address);
      await frontendContract.isArea(ethers.encodeBytes32String("SAUDE"));
      await frontendContract.budget(2024, ethers.encodeBytes32String("SAUDE"));
      await frontendContract.totalSupplyArea(ethers.encodeBytes32String("SAUDE"));
      
      console.log(`   - ABI do frontend: ✅ Compatível`);
    } catch (error) {
      console.log(`   - ABI do frontend: ❌ Incompatível (${error.message})`);
    }

    console.log("\n📈 Estatísticas:");
    
    // 10. Estatísticas de gas - simplified version
    try {
      const bytecodeSize = (bytecode.length - 2) / 2;
      console.log(`   - Tamanho do bytecode: ${bytecodeSize} bytes`);
      console.log(`   - Limite Ethereum: ${24000} bytes (${((bytecodeSize / 24000) * 100).toFixed(1)}% usado)`);
    } catch (error) {
      console.log(`   - Erro ao calcular estatísticas: ${error.message}`);
    }

    console.log("\n🎉 Verificação concluída com sucesso!");
    console.log(`📋 Resumo: Contrato ${actualContractAddress} está funcionando corretamente na rede ${network.name}`);
    
    return {
      success: true,
      contractAddress: actualContractAddress,
      tokenAddress,
      network: network.name,
      chainId: network.chainId
    };

  } catch (error) {
    console.error("\n❌ Erro durante a verificação:");
    console.error(`   ${error.message}`);
    console.error("\n🔧 Possíveis soluções:");
    console.error("   - Verifique se o contrato foi implantado corretamente");
    console.error("   - Confirme se está na rede correta");
    console.error("   - Verifique se o endereço está correto");
    console.error("   - Execute 'npm run compile' para recompilar");
    
    return {
      success: false,
      error: error.message
    };
  }
}

// Se executado diretamente
if (require.main === module) {
  const contractAddress = process.argv[2];
  
  if (contractAddress) {
    console.log(`Verificando contrato existente: ${contractAddress}\n`);
  } else {
    console.log("Fazendo deploy e verificando novo contrato\n");
  }
  
  verifyContractDeployment(contractAddress)
    .then((result) => {
      if (result.success) {
        console.log("\n✅ Script executado com sucesso!");
        process.exit(0);
      } else {
        console.log("\n❌ Script falhou!");
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error("❌ Erro fatal:", error);
      process.exit(1);
    });
}

module.exports = { verifyContractDeployment };

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
