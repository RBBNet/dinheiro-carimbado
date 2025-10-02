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
    // console.log(`   - Deployer: ${deployer.address}`);
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
        "function totalSupplyAreaYear(bytes32, uint16) view returns (uint256)"
      ];
      
      const frontendContract = new ethers.Contract(actualContractAddress, frontendAbi, deployer);
      
      // Testar todos os métodos da ABI mínima
      await frontendContract.isLegislator(deployer.address);
      await frontendContract.isArea(ethers.encodeBytes32String("SAUDE"));
      await frontendContract.budget(2024, ethers.encodeBytes32String("SAUDE"));
      await frontendContract.totalSupplyAreaYear(ethers.encodeBytes32String("SAUDE"), 2024);
      
      console.log(`   - ABI do frontend: ✅ Compatível`);
    } catch (error) {
      console.log(`   - ABI do frontend: ❌ Incompatível (${error.message})`);
    }

    // >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
    // NOVO BLOCO: Verificação detalhada da ABI do contrato DinheiroCarimbado
    // >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
    (function fullAbiCheck() {
      console.log("\n🧩 Verificação completa da ABI:");

      // Funções esperadas (assinatura nome(tipo,...); sem retornos)
      const expectedFunctions = [
        // getters / state
        "token()",
        "tokenScale()",
        "owner()",
        "isLegislator(address)",
        "isTreasury(address)",
        "isAgency(address)",
        "isLiquidator(address)",
        "agencyNames(address)",
        "isArea(bytes32)",
        "getAreas()",
        "isCompany(address)",
        "isCompanyAllowedForArea(address,bytes32)",
        "getCompanyName(address)",
        "getTotalBalanceByArea(address,bytes32)",
        "getBalanceByAreaYear(address,bytes32,uint16)",
        "budget(uint16,bytes32)",
        "getBudgetYears()",
        "getBudgetsForYear(uint16)",
        "getAllBudgets()",
        "remaining(uint16,bytes32)",
        "balanceOfAreaYear(address,bytes32,uint16)",
        "totalSupplyAreaYear(bytes32,uint16)",
        "totalMintedAreaYear(bytes32,uint16)",

        // mutating / admin
        "setLegislator(address,bool)",
        "setTreasury(address,bool)",
        "setAgency(address,bool,string)",
        "setLiquidator(address,bool)",
        "addArea(bytes32)",
        "removeArea(bytes32)",
        "upsertCompany(address,bytes14,string,bool)",
        "setCompanyArea(address,bytes32,bool)",
        "mintToAgency(address,bytes32,uint16,uint256)",
        "transferAgencyToAgency(address,bytes32,uint16,uint256)",
        "payCompany(address,bytes32,uint16,uint256)",
        "settle(address,bytes32,uint16,uint256,bytes32)",
        "transferOwnership(address)"
      ];

      // Eventos esperados
      const expectedEvents = [
        "RoleSet(string,address,bool)",
        "AgencyNameSet(address,string)",
        "AreaAdded(bytes32)",
        "AreaRemoved(bytes32)",
        "CompanyUpsert(address,bytes14,string,bool)",
        "CompanyAreaSet(address,bytes32,bool)",
        "BudgetSet(uint16,bytes32,uint256)",
        "MintToAgency(address,bytes32,uint16,uint256)",
        "TransferAreaYear(address,address,uint16,bytes32,uint256)",
        "PaidCompany(address,address,uint16,bytes32,uint256)",
        "Settled(address,bytes32,uint16,uint256,bytes32)"
      ];

      // Utilidades para normalizar assinaturas
      const fragments = dinheiroCarimbado.interface.fragments;

      const fnFragments = fragments.filter(f => f.type === "function");
      const evFragments = fragments.filter(f => f.type === "event");

      const sigFn = (f) => `${f.name}(${f.inputs.map(i => i.type).join(",")})`;
      const sigEv = (f) => `${f.name}(${f.inputs.map(i => i.type).join(",")})`;

      const actualFunctions = new Set(fnFragments.map(sigFn));
      const actualEvents = new Set(evFragments.map(sigEv));

      const missingFunctions = expectedFunctions.filter(f => !actualFunctions.has(f));
      const unexpectedFunctions = [...actualFunctions].filter(f => !expectedFunctions.includes(f));

      const missingEvents = expectedEvents.filter(e => !actualEvents.has(e));
      const unexpectedEvents = [...actualEvents].filter(e => !expectedEvents.includes(e));

      console.log("   Funções esperadas:", expectedFunctions.length);
      console.log("   Funções encontradas:", actualFunctions.size);
      console.log("   Eventos esperados:", expectedEvents.length);
      console.log("   Eventos encontrados:", actualEvents.size);

      if (!missingFunctions.length && !missingEvents.length) {
        console.log("   ✅ Todas as funções e eventos esperados estão presentes.");
      } else {
        if (missingFunctions.length)
          console.log("   ❌ Funções ausentes:", missingFunctions.join("; "));
        if (missingEvents.length)
          console.log("   ❌ Eventos ausentes:", missingEvents.join("; "));
      }

      if (unexpectedFunctions.length) {
        console.log("   ⚠️ Funções adicionais (não listadas como esperadas):", unexpectedFunctions.join("; "));
      }
      if (unexpectedEvents.length) {
        console.log("   ⚠️ Eventos adicionais (não listados como esperados):", unexpectedEvents.join("; "));
      }

      // Checagem especial: assinatura de array complexa (getAllBudgets)
      const hasGetAllBudgets = actualFunctions.has("getAllBudgets()");
      if (hasGetAllBudgets) {
        const f = fnFragments.find(f => sigFn(f) === "getAllBudgets()");
        const returnsTupleArray = f?.outputs?.[0]?.baseType === "array" &&
          /tuple/.test(f.outputs[0].type || "");
        console.log(`   Detalhe getAllBudgets(): ${returnsTupleArray ? "✅ Retorna array de tuplas" : "⚠️ Formato inesperado"}`);
      } else {
        console.log("   ⚠️ getAllBudgets() não encontrado para validação estrutural.");
      }

      // Expor resultado resumido para uso posterior no script
      dinheiroCarimbado.__abiCheck = {
        missingFunctions,
        missingEvents,
        unexpectedFunctions,
        unexpectedEvents,
        ok: !missingFunctions.length && !missingEvents.length
      };
    })();
    // >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

    // ==============================================================
    // 📦 Dump de estado usando apenas chamadas view (sem eventos)
    // ==============================================================
    console.log("\n📦 Dump de estado (views)...");

    function b32ToLabel(b32) {
      try { return ethers.decodeBytes32String(b32); } catch { return b32; }
    }

    const stateDump = {};

    async function fetchArray(fnName) {
      if (!dinheiroCarimbado[fnName]) return [];
      try { return await dinheiroCarimbado[fnName](); } catch { return []; }
    }

    const legislators = await fetchArray('getLegislators');
    const treasuries  = await fetchArray('getTreasuries');
    const agencies    = await fetchArray('getAgencies');
    const liquidators = await fetchArray('getLiquidators');
    console.log(`   Legisladores (${legislators.length}):`, legislators.length ? legislators.join(', ') : '(nenhum)');
    console.log(`   Tesouraria (${treasuries.length}):`, treasuries.length ? treasuries.join(', ') : '(nenhuma)');
    console.log(`   Agências (${agencies.length}):`, agencies.length ? agencies.join(', ') : '(nenhuma)');
    console.log(`   Liquidators (${liquidators.length}):`, liquidators.length ? liquidators.join(', ') : '(nenhum)');

    stateDump.legislators = legislators;
    stateDump.treasuries = treasuries;
    stateDump.agencies = agencies;
    stateDump.liquidators = liquidators;

    const companies = await fetchArray('getCompanies');
    console.log(`\n🏢 Empresas (${companies.length}):`);
    const companiesDetail = [];
    for (const addr of companies) {
      try {
        if (dinheiroCarimbado.getCompany) {
          const c = await dinheiroCarimbado.getCompany(addr);
          const cnpj = c[0];
          const name = c[1];
          const active = c[2];
          const areas = c[3].map(b32ToLabel);
          companiesDetail.push({ address: addr, cnpj, name, active, areas });
          console.log(`   • ${addr} ativo=${active} nome="${name}" CNPJ=${cnpj} áreas=[${areas.join(', ')}]`);
        } else {
          const name = await dinheiroCarimbado.getCompanyName(addr).catch(()=>'(nome indisponível)');
          companiesDetail.push({ address: addr, name });
          console.log(`   • ${addr} nome="${name}"`);
        }
      } catch (e) {
        console.log(`   • ${addr} (falha ao obter detalhes: ${e.message})`);
      }
    }
    stateDump.companies = companiesDetail;

    let areasActive = [];
    try { areasActive = await dinheiroCarimbado.getAreas(); } catch {}
    const areaLabels = areasActive.map(b32ToLabel);
    console.log(`\n🗂️  Áreas ativas (${areaLabels.length}):`, areaLabels.length ? areaLabels.join(', ') : '(nenhuma)');
    stateDump.areas = areaLabels;

    let budgets = [];
    if (dinheiroCarimbado.getAllBudgets) {
      try {
        const all = await dinheiroCarimbado.getAllBudgets();
        budgets = all.map(entry => ({
          year: Number(entry.ano || entry[0]),
            area: b32ToLabel(entry.area || entry[1]),
            cap: (entry.cap || entry[2]).toString(),
            minted: (entry.minted || entry[3]).toString(),
            realized: (entry.realized || entry[4]).toString()
        }));
      } catch {}
    } else if (dinheiroCarimbado.getBudgetYears && dinheiroCarimbado.getBudgetsForYear) {
      try {
        const years = await dinheiroCarimbado.getBudgetYears();
        for (const y of years) {
          try {
            const r = await dinheiroCarimbado.getBudgetsForYear(y);
            const areas = r.areas || r[0];
            const caps = r.caps || r[1];
            const mintedVals = r.mintedValues || r[2];
            const realizedVals = r.realizedValues || r[3];
            for (let i = 0; i < areas.length; i++) {
              budgets.push({
                year: Number(y),
                area: b32ToLabel(areas[i]),
                cap: caps[i].toString(),
                minted: mintedVals[i].toString(),
                realized: realizedVals[i].toString()
              });
            }
          } catch {}
        }
      } catch {}
    }
    console.log(`\n💰 Orçamentos (${budgets.length} registros):`);
    for (const b of budgets) {
      console.log(`   • ano=${b.year} área=${b.area} cap=${b.cap} minted=${b.minted} realized=${b.realized}`);
    }
    stateDump.budgets = budgets;

    const agencyBalances = [];
    if (agencies.length && areaLabels.length && budgets.length) {
      const years = [...new Set(budgets.map(b => b.year))];
      for (const year of years) {
        for (const area of areaLabels) {
          let entries = [];
          if (dinheiroCarimbado.getAgencyBalances) {
            try {
              const res = await dinheiroCarimbado.getAgencyBalances(ethers.encodeBytes32String(area), year);
              const addrs = res[0]; const bals = res[1];
              for (let i = 0; i < addrs.length; i++) entries.push({ agency: addrs[i], year, area, balance: bals[i].toString() });
            } catch {}
          }
          if (!entries.length) {
            for (const ag of agencies) {
              try {
                const bal = await dinheiroCarimbado.balanceOfAreaYear(ag, ethers.encodeBytes32String(area), year);
                if (bal > 0n) entries.push({ agency: ag, year, area, balance: bal.toString() });
              } catch {}
            }
          }
          for (const e of entries) agencyBalances.push(e);
        }
      }
    }
    console.log(`\n🏦 Saldos de agências (registros > 0):`);
    if (!agencyBalances.length) console.log('   (nenhum saldo positivo encontrado)');
    else agencyBalances.forEach(r => console.log(`   • ano=${r.year} área=${r.area} agência=${r.agency} saldo=${r.balance}`));
    stateDump.agencyBalances = agencyBalances;

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
      chainId: network.chainId,
      // incluir dump agregado
      stateDump
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

// Se executado diretamente via Hardhat
async function main() {
  // Para usar com hardhat run, passe o endereço como variável de ambiente:
  // CONTRACT_ADDRESS=0x1234... npx hardhat run scripts/verify-deployment.js --network rbblab
  // OU deixe usar DC_CONTRACT do .env automaticamente
  const contractAddress = process.env.CONTRACT_ADDRESS || process.env.DC_CONTRACT;
  
  if (contractAddress) {
    console.log(`Verificando contrato existente: ${contractAddress}`);
    if (process.env.DC_CONTRACT && !process.env.CONTRACT_ADDRESS) {
      console.log(`(usando DC_CONTRACT do .env)\n`);
    } else {
      console.log(`(usando CONTRACT_ADDRESS)\n`);
    }
  } else {
    console.log("Fazendo deploy e verificando novo contrato\n");
    console.log("💡 Para verificar um contrato específico, use:");
    console.log("   CONTRACT_ADDRESS=0x1234... npx hardhat run scripts/verify-deployment.js --network rbblab");
    console.log("   ou defina DC_CONTRACT no arquivo .env\n");
  }
  
  const result = await verifyContractDeployment(contractAddress);
  
  if (result.success) {
    console.log("\n✅ Script executado com sucesso!");
    process.exit(0);
  } else {
    console.log("\n❌ Script falhou!");
    process.exit(1);
  }
}

// Se executado diretamente
if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Erro fatal:", error);
    process.exit(1);
  });
}

module.exports = { verifyContractDeployment };
