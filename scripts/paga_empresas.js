/**
 * SCRIPT DE PAGAMENTOS PARA EMPRESAS
 * ===================================
 * 
 * Este script realiza pagamentos de 10 tokens de duas agências específicas
 * (Ministério da Saúde e Ministério da Educação) para todas as empresas
 * cadastradas no arquivo CSV.
 * 
 * FUNCIONAMENTO:
 * - Lê empresas do arquivo data/cadastros_empresa.csv
 * - Usa apenas o 2º e 3º signers (agências de Saúde e Educação)
 * - Tenta pagar 10 tokens de cada agência para cada empresa
 * - Deixa o smart contract rejeitar pagamentos inválidos
 * - Não controla saldos nem áreas (deixa o contrato decidir)
 * 
 * CONFIGURAÇÃO NECESSÁRIA:
 * - Contrato deve estar deployado (DC_CONTRACT no .env)
 * - Agências devem ter saldos suficientes em suas áreas
 * - Empresas devem estar cadastradas e habilitadas para suas áreas
 * - Private keys das agências devem estar no .env:
 *   - AGENCIA_SAUDE_PRIVATE_KEY
 *   - AGENCIA_EDUCACAO_PRIVATE_KEY
 * 
 * USO:
 * npm run node scripts/paga_empresas.js
 * 
 * REDE ALVO:
 * Configurado para rede 'rbblab' que usa as chaves privadas do .env
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('hardhat');

async function main() {
  console.log('💰 SCRIPT DE PAGAMENTOS PARA EMPRESAS');
  console.log('=====================================\n');
  
  // Caminho do CSV
  const csvPath = path.join(__dirname, '../data/cadastros_empresa.csv');
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.trim().split('\n');
  const header = lines[0].split(',');
  
  // Parse empresas do CSV
  const empresas = [];
  for (let i = 1; i < lines.length; i++) {
    const [address, cnpj, nome, area] = lines[i].split(',');
    empresas.push({
      address: address.trim(),
      cnpj: cnpj.trim(),
      nome: nome.trim(),
      area: area.trim().toUpperCase()
    });
  }
  
  console.log(`📋 Carregadas ${empresas.length} empresas do CSV:`);
  empresas.forEach(e => console.log(`   - ${e.nome} (${e.area})`));
  console.log();
  
  // Instancia contrato
  const contractAddress = process.env.DC_CONTRACT || '0x5FbDB2315678afecb367f032d93F642f64180aa3';
  console.log(`🏛️  Conectando ao contrato: ${contractAddress}`);
  
  const signers = await ethers.getSigners();
  const DC = await ethers.getContractFactory('DinheiroCarimbado');
  const contract = DC.attach(contractAddress);

  
  // Usar apenas o 2º e 3º signers (agências Saúde e Educação)
  if (signers.length < 3) {
    console.error('❌ Erro: Necessário pelo menos 3 signers configurados');
    console.error('   Verifique se AGENCIA_SAUDE_PRIVATE_KEY e AGENCIA_EDUCACAO_PRIVATE_KEY estão no .env');
    return;
  }
  
  const agenciaSaude = signers[1];    // 2º signer (AGENCIA_SAUDE_PRIVATE_KEY)
  const agenciaEducacao = signers[2]; // 3º signer (AGENCIA_EDUCACAO_PRIVATE_KEY)
  
  console.log(`🏥 Agência Saúde: ${agenciaSaude.address}`);
  console.log(`🎓 Agência Educação: ${agenciaEducacao.address}`);
  
  // Obter nomes das agências
  let nomeSaude, nomeEducacao;
  try {
    nomeSaude = await contract.agencyNames(agenciaSaude.address);
    nomeEducacao = await contract.agencyNames(agenciaEducacao.address);
  } catch (error) {
    console.warn('⚠️  Não foi possível obter nomes das agências');
    nomeSaude = 'Agência Saúde';
    nomeEducacao = 'Agência Educação';
  }
  
  console.log(`   - ${nomeSaude || 'Agência Saúde'}`);
  console.log(`   - ${nomeEducacao || 'Agência Educação'}`);
  console.log();
  
  // Valor do pagamento (10 tokens)
  const PAGAMENTO = 10;
  
  // Definir áreas (bytes32)
  const SAUDE = ethers.encodeBytes32String('SAUDE');
  const EDUCACAO = ethers.encodeBytes32String('EDUCACAO');
  
  // Ano padrão (pode ser ajustado)
  const ANO = 2025;
  
  let totalTentativas = 0;
  let pagamentosRealizados = 0;
  let erros = 0;
  
  console.log(`💰 Iniciando pagamentos de ${PAGAMENTO} tokens por empresa`);
  console.log(`📅 Ano: ${ANO}`);
  console.log('═'.repeat(60));
  
  // Para cada empresa do CSV
  for (const empresa of empresas) {
    console.log(`\n🏢 ${empresa.nome} (${empresa.area})`);
    
    // Tentar pagamento da Agência de Saúde
    totalTentativas++;
    console.log(`  🏥 Tentando pagamento de ${nomeSaude}...`);
    try {
      const tx = await contract.connect(agenciaSaude).payCompany(
        empresa.address,
        SAUDE,
        ANO,
        PAGAMENTO
      );
      await tx.wait();
      console.log(`     ✅ Sucesso! Hash: ${tx.hash.slice(0, 10)}...`);
      pagamentosRealizados++;
    } catch (error) {
      console.log(`     ❌ Rejeitado: ${getErrorReason(error)}`);
      erros++;
    }
    
    // Tentar pagamento da Agência de Educação
    totalTentativas++;
    console.log(`  🎓 Tentando pagamento de ${nomeEducacao}...`);
    try {
      const tx = await contract.connect(agenciaEducacao).payCompany(
        empresa.address,
        EDUCACAO,
        ANO,
        PAGAMENTO
      );
      await tx.wait();
      console.log(`     ✅ Sucesso! Hash: ${tx.hash.slice(0, 10)}...`);
      pagamentosRealizados++;
    } catch (error) {
      console.log(`     ❌ Rejeitado: ${getErrorReason(error)}`);
      erros++;
    }
  }
  
  // Função para extrair motivo do erro
  function getErrorReason(error) {
    const message = error.message || error.toString();
    
    if (message.includes('insufficient')) {
      return 'Saldo insuficiente';
    } else if (message.includes('company/area not allowed')) {
      return 'Empresa não habilitada para esta área';
    } else if (message.includes('from not agency')) {
      return 'Remetente não é agência autorizada';
    } else if (message.includes('invalid area')) {
      return 'Área inválida';
    } else if (message.includes('not company')) {
      return 'Endereço não é empresa cadastrada';
    } else {
      return message.split('\n')[0].slice(0, 50) + '...';  // Primeira linha, limitada
    }
  }
  
  console.log('\n' + '═'.repeat(60));
  console.log('📊 RESUMO DOS PAGAMENTOS');
  console.log('═'.repeat(60));
  console.log(`Total de tentativas: ${totalTentativas}`);
  console.log(`Pagamentos realizados: ${pagamentosRealizados}`);
  console.log(`Rejeições: ${erros}`);
  
  if (pagamentosRealizados > 0) {
    console.log(`✅ ${pagamentosRealizados} pagamentos concluídos com sucesso!`);
  }
  
  if (erros > 0) {
    console.log(`⚠️  ${erros} tentativas foram rejeitadas pelo smart contract`);
  }
  
  const taxa = totalTentativas > 0 ? ((pagamentosRealizados / totalTentativas) * 100).toFixed(1) : '0.0';
  console.log(`📈 Taxa de sucesso: ${taxa}%`);
  console.log();
}

main().catch((err) => {
  console.error('Erro ao executar pagamentos:', err);
  process.exit(1);
});
