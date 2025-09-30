// Frontend legislador - versão simplificada
(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // ABI mínima - apenas o que usamos
  const abi = [
    'function isLegislator(address) view returns (bool)',
    'function getAreas() view returns (bytes32[])',
    'function getBudgetYears() view returns (uint16[])',
    'function getBudgetsForYear(uint16) view returns (bytes32[] areas,uint256[] caps,uint256[] mintedValues,uint256[] realizedValues)',
    'function setBudget(uint16,bytes32,uint256)',
    'event BudgetSet(uint16 indexed ano,bytes32 indexed area,uint256 cap)'
  ];

  let provider, signer, contract, account;

  // Helpers
  const setStatus = (m) => { const el = $('#status'); if (el) el.textContent = m; };
  const getAddr = () => localStorage.getItem('dc_contract') || '';
  const b2s = (b) => { try { return ethers.decodeBytes32String(b); } catch { return b; } };
  const log = (msg) => { 
    const el = $('#txLog'); 
    if (el) el.textContent += msg + '\n'; 
    console.log(msg); 
  };

  // Conexão
  async function connect() {
    if (!window.ethereum) { alert('MetaMask não encontrada'); return; }
    
    try {
      provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send('eth_requestAccounts', []);
      signer = await provider.getSigner();
      account = await signer.getAddress();
      
      const net = await provider.getNetwork();
      $('#account').textContent = account;
      $('#network').textContent = `${net.name} (${net.chainId})`;
      
      setStatus('Conectado.');
      await init();
    } catch (e) {
      setStatus('Erro na conexão: ' + e.message);
      console.error(e);
    }
  }

  // Inicialização
  async function init() {
    const addr = getAddr();
    if (!addr) { 
      setStatus('Digite o endereço do contrato e clique Salvar'); 
      return; 
    }
    
    try {
      contract = new ethers.Contract(addr, abi, signer);
      
      // Verificar se é legislador
      const isLeg = await contract.isLegislator(account);
      $('#isLegislator').textContent = isLeg ? 'Sim' : 'Não';
      
      const submitBtn = $('#submitBudget');
      if (submitBtn) {
        submitBtn.disabled = !isLeg;
        if (!isLeg) {
          setStatus('Conta não é legislador - botão desabilitado');
        }
      }
      
      // Carregar áreas e orçamentos
      await loadData();
      setStatus('Pronto.');
      
    } catch (e) {
      setStatus('Erro ao inicializar: ' + e.message);
      console.error(e);
    }
  }

  async function loadData() {
    try {
      // Carregar áreas
      const areas = await contract.getAreas();
      const areasEl = $('#areasList');
      if (areasEl) {
        areasEl.innerHTML = areas.map(a => `<code>${b2s(a)}</code>`).join(' • ');
      }
      
      // Criar form
      const caps = $('#perAreaCaps');
      if (caps) {
        caps.innerHTML = '';
        for (const area of areas) {
          const div = document.createElement('div');
          div.className = 'form-grid';
          div.innerHTML = `<label>${b2s(area)}</label><input id="cap_${area}" type="number" min="0" placeholder="0">`;
          caps.appendChild(div);
        }
      }
      
      // Carregar orçamentos
      const years = await contract.getBudgetYears();
      const budgetsEl = $('#budgetsTable');
      if (!budgetsEl) return;
      
      if (years.length === 0) {
        budgetsEl.textContent = 'Nenhum orçamento definido.';
        return;
      }
      
      let html = '<table><thead><tr><th>Ano</th><th>Área</th><th>Cap</th><th>Emitido</th><th>Realizado</th></tr></thead><tbody>';
      
      for (const year of years) {
        const budgets = await contract.getBudgetsForYear(year);
        const yearAreas = budgets[0] || [];
        const caps = budgets[1] || [];
        const minted = budgets[2] || [];
        const realized = budgets[3] || [];
        
        for (let i = 0; i < yearAreas.length; i++) {
          html += `<tr>
            <td>${year}</td>
            <td>${b2s(yearAreas[i])}</td>
            <td>${caps[i]}</td>
            <td>${minted[i]}</td>
            <td>${realized[i]}</td>
          </tr>`;
        }
      }
      html += '</tbody></table>';
      budgetsEl.innerHTML = html;
      
    } catch (e) {
      console.error('Erro ao carregar dados:', e);
      setStatus('Erro ao carregar dados: ' + e.message);
    }
  }

  // Definir orçamento - SIMPLES como no console
  async function submit() {
    console.log('Submit chamado!'); // Debug
    
    const logEl = $('#txLog');
    if (logEl) logEl.textContent = '';
    
    if (!contract) {
      log('Contrato não conectado');
      return;
    }
    
    const yearEl = $('#newYear');
    if (!yearEl) {
      log('Campo ano não encontrado');
      return;
    }
    
    const year = Number(yearEl.value);
    
    if (!year || year < 0 || year > 65535) {
      alert('Ano inválido');
      return;
    }

    const inputs = $$('#perAreaCaps input');
    if (inputs.length === 0) {
      log('Nenhum campo de área encontrado');
      return;
    }
    
    let processedAny = false;
    
    for (const input of inputs) {
      const area = input.id.replace('cap_', '');
      const value = input.value.trim();
      
      if (!value || value === '0') continue;
      
      processedAny = true;
      const amount = BigInt(value);
      
      try {
        log(`Definindo orçamento: ${b2s(area)} = ${amount} para ${year}`);
        
        // Estimativa de gas
        const ov0 = { type: 0, gasPrice: 0n };
        const est = await contract.setBudget.estimateGas(year, area, amount, ov0);
        console.log(`Estimativa e gas: ${est}`);

        const tx = await contract.setBudget(year, area, amount, 
          {
            ...ov0,
            gasLimit: (est * 12n)/10n
          });

        log(`Transação enviada: ${tx.hash}`);
        
        await tx.wait();
        log(`Confirmado!`);
        
      } catch (e) {
        log(`Erro em ${b2s(area)}: ${e.shortMessage || e.message}`);
        console.error(e);
      }
    }
    
    if (!processedAny) {
      log('Nenhum valor > 0 encontrado para processar');
    }
    
    // Recarregar dados
    try {
      await loadData();
    } catch (e) {
      console.error('Erro ao recarregar:', e);
    }
  }

  // Salvar endereço
  function saveAddr() {
    const addrEl = $('#contractAddress');
    if (!addrEl) {
      console.error('Campo contractAddress não encontrado');
      return;
    }
    
    const addr = addrEl.value.trim();
    if (!addr) {
      alert('Digite um endereço válido');
      return;
    }
    
    localStorage.setItem('dc_contract', addr);
    setStatus('Contrato salvo: ' + addr.substring(0, 10) + '...');
    
    if (provider && signer) {
      init();
    }
  }

  // Setup inicial quando DOM carrega
  function setup() {
    console.log('Setup iniciado');
    
    // Event listeners
    const connectBtn = $('#connectBtn');
    const saveBtn = $('#saveAddress'); 
    const submitBtn = $('#submitBudget');
    
    if (connectBtn) {
      connectBtn.addEventListener('click', connect);
      console.log('Connect listener adicionado');
    } else {
      console.error('Botão connectBtn não encontrado');
    }
    
    if (saveBtn) {
      saveBtn.addEventListener('click', saveAddr);
      console.log('Save listener adicionado');
    } else {
      console.error('Botão saveAddress não encontrado');
    }
    
    if (submitBtn) {
      submitBtn.addEventListener('click', submit);
      console.log('Submit listener adicionado');
    } else {
      console.error('Botão submitBudget não encontrado');
    }

    // Carregar endereço salvo
    const saved = getAddr();
    const addrEl = $('#contractAddress');
    if (saved && addrEl) {
      addrEl.value = saved;
      console.log('Endereço carregado:', saved);
    }
  }

  // Aguardar DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();
