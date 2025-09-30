(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const abi = [
    "function isAgency(address) view returns (bool)",
    "function isArea(bytes32) view returns (bool)",
    "function isCompany(address) view returns (bool)",
    "function isCompanyAllowedForArea(address, bytes32) view returns (bool)",
    "function balanceOfAreaYear(address, bytes32, uint16) view returns (uint256)",
    "function agencyNames(address) view returns (string)",
    "function getCompanyName(address) view returns (string)",
    "function getAreas() view returns (bytes32[])",
    "function getCompanies() view returns (address[])",
    "function getCompany(address) view returns (bytes14 cnpj, string name, bool active, bytes32[] areas)",
    "function getBudgetYears() view returns (uint16[])",
    "function payCompany(address empresa, bytes32 area, uint16 ano, uint256 amount)",
    "event PaidCompany(address indexed agency, address indexed company, uint16 indexed ano, bytes32 area, uint256 amount)",
    "event TransferAreaYear(address indexed from, address indexed to, uint16 indexed ano, bytes32 area, uint256 amount)",
  ];

  let provider, signer, contract;
  let account;
  let areas = [];
  let companies = new Map(); // address -> {cnpj, name, allowedAreas: Set}
  let hackerMode = false; // Flag para modo hacker

  const connectBtn = $("#connectBtn");
  const hackerLabel = $("#hackerLabel");
  const status = $("#status");
  const accountSpan = $("#account");
  const networkSpan = $("#network");
  const isAgencySpan = $("#isAgency");
  const agencyNameSpan = $("#agencyName");
  const balancesTable = $("#balancesTable");
  const paymentYear = $("#paymentYear");
  const paymentArea = $("#paymentArea");
  const paymentCompany = $("#paymentCompany");
  const paymentAmount = $("#paymentAmount");
  const btnPay = $("#btnPay");
  const txLog = $("#txLog");

  function setStatus(t) { status.textContent = t; }

  function getSavedAddress() {
    return localStorage.getItem("dc_contract") || "";
  }

  function shorten(addr) {
    return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '';
  }

  function b32ToLabel(b32) {
    try { return ethers.decodeBytes32String(b32); } catch { return b32; }
  }

  function formatCNPJ(cnpjBytes) {
    try {
      // Convert bytes14 to string
      const hex = cnpjBytes.startsWith('0x') ? cnpjBytes.slice(2) : cnpjBytes;
      const bytes = ethers.toUtf8String('0x' + hex);
      // Format as XX.XXX.XXX/XXXX-XX if 14 digits
      if (bytes.length === 14 && /^\d{14}$/.test(bytes)) {
        return `${bytes.slice(0,2)}.${bytes.slice(2,5)}.${bytes.slice(5,8)}/${bytes.slice(8,12)}-${bytes.slice(12,14)}`;
      }
      return bytes;
    } catch {
      return cnpjBytes;
    }
  }

  async function connect() {
    if (!window.ethereum) { alert("MetaMask não encontrada."); return; }
    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    account = await signer.getAddress();
    const net = await provider.getNetwork();
    networkSpan.textContent = `${net.name} (${net.chainId})`;
    accountSpan.textContent = account;
    setStatus("Conectado.");
    await initContract();
  }

  async function assertContractDeployed(addr) {
    if (!ethers.isAddress(addr)) throw new Error("Endereço do contrato inválido.");
    const code = await provider.getCode(addr);
    if (!code || code === "0x") throw new Error("Nenhum contrato encontrado nesse endereço na rede atual.");
  }

  async function initContract() {
    try {
      const addr = getSavedAddress();
      if (!addr) { setStatus("Erro: endereço do contrato vazio."); return; }
      await assertContractDeployed(addr);
      contract = new ethers.Contract(addr, abi, signer);

      // Check if current account is an agency
      const isAgency = await contract.isAgency(account);
      isAgencySpan.textContent = isAgency ? "Sim" : "Não";
      // No modo hacker, permite pagamentos mesmo se não for agência
      btnPay.disabled = !isAgency && !hackerMode;

      if (isAgency) {
        // Get agency name
        try {
          const name = await contract.agencyNames(account);
          agencyNameSpan.textContent = name || shorten(account);
        } catch {
          agencyNameSpan.textContent = shorten(account);
        }

  // Load via getters (sem varrer logs)
  areas = await discoverAreas();
  await discoverCompanies();
        await renderBalances(areas);
        await populateAreas(areas);
        await updateCompanyDropdown();

        subscribeEvents();
      }

      setStatus("Contrato pronto.");
    } catch (e) {
      console.error(e);
      setStatus("Erro: " + (e.message || e));
    }
  }

  async function discoverAreas() {
    if (!contract.getAreas) return [];
    try { return await contract.getAreas(); } catch { return []; }
  }

  async function discoverCompanies() {
    companies.clear();
    if (!contract.getCompanies) return;
    let list = [];
    try { list = await contract.getCompanies(); } catch { list = []; }
    for (const addr of list) {
      try {
        const info = await contract.getCompany(addr);
        const cnpj = info.cnpj || info[0];
        const name = info.name || info[1];
        const active = info.active || info[2];
        const areasAllowed = info.areas || info[3];
        if (active) {
          companies.set(addr, { cnpj, name, allowedAreas: new Set(areasAllowed) });
        }
      } catch (e) {
        console.warn('Falha ao obter getCompany para', addr, e.message);
      }
    }
  }

  async function renderBalances(areas) {
    balancesTable.innerHTML = 'Carregando…';
    let years = [];
    if (contract.getBudgetYears) {
      try { years = await contract.getBudgetYears(); } catch { years = []; }
    }
    if (!years.length) {
      const currentYear = new Date().getFullYear();
      for (let y = currentYear - 2; y <= currentYear + 2; y++) years.push(y);
    }
    let rows = '';
    for (const ano of years) {
      for (const area of areas) {
        try {
          const bal = await contract.balanceOfAreaYear(account, area, ano);
          if (bal > 0n) rows += `<tr><td>${ano}</td><td>${b32ToLabel(area)}</td><td>${bal}</td></tr>`;
        } catch {}
      }
    }
    if (!rows) rows = '<tr><td colspan="3" style="text-align:center;color:#666;">Nenhum saldo disponível</td></tr>';
    balancesTable.innerHTML = `<table><thead><tr><th>Ano</th><th>Área</th><th>Saldo</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  async function populateAreas(areas) {
    paymentArea.innerHTML = "";
    const placeholderOpt = document.createElement("option");
    placeholderOpt.value = "";
    placeholderOpt.textContent = "Selecione uma área";
    paymentArea.appendChild(placeholderOpt);
    
    for (const area of areas) {
      const opt = document.createElement("option");
      opt.value = area;
      opt.textContent = b32ToLabel(area);
      paymentArea.appendChild(opt);
    }
    
    // Update company dropdown when area changes
    paymentArea.addEventListener('change', updateCompanyDropdown);
  }

  async function updateCompanyDropdown() {
    const selectedArea = paymentArea.value;
    paymentCompany.innerHTML = "";
    
    const placeholderOpt = document.createElement("option");
    placeholderOpt.value = "";
    placeholderOpt.textContent = selectedArea ? "Selecione uma empresa" : "Selecione uma área primeiro";
    paymentCompany.appendChild(placeholderOpt);
    
    if (!selectedArea) return;
    
    // No modo hacker, mostra TODAS as empresas, não só as permitidas para a área
    const companiesToShow = [];
    if (hackerMode) {
      // Modo hacker: mostra todas as empresas cadastradas
      for (const [address, company] of companies.entries()) {
        companiesToShow.push({ address, ...company });
      }
    } else {
      // Modo normal: só empresas permitidas para a área selecionada
      for (const [address, company] of companies.entries()) {
        if (company.allowedAreas.has(selectedArea)) {
          companiesToShow.push({ address, ...company });
        }
      }
    }
    
    if (companiesToShow.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = hackerMode ? "Nenhuma empresa cadastrada" : "Nenhuma empresa habilitada para esta área";
      paymentCompany.appendChild(opt);
      return;
    }
    
    // Sort by name
    companiesToShow.sort((a, b) => a.name.localeCompare(b.name));
    
    for (const company of companiesToShow) {
      const opt = document.createElement("option");
      opt.value = company.address;
      const isAllowed = company.allowedAreas.has(selectedArea);
      const prefix = hackerMode && !isAllowed ? "⚠️ " : "";
      opt.textContent = `${prefix}${formatCNPJ(company.cnpj)} - ${company.name}`;
      opt.title = `${company.address} - ${company.name}${hackerMode && !isAllowed ? " (NÃO HABILITADA PARA ESTA ÁREA)" : ""}`;
      paymentCompany.appendChild(opt);
    }
  }

  async function onPay() {
    txLog.textContent = "";
    const year = Number(paymentYear.value);
    const area = paymentArea.value;
    const companyAddr = paymentCompany.value;
    const amountStr = paymentAmount.value.trim();
    
    if (!Number.isInteger(year) || year < 0 || year > 65535) {
      alert('Ano inválido');
      return;
    }
    
    if (!area || !companyAddr || amountStr === '') { 
      alert('Preencha todos os campos'); 
      return; 
    }
    
    const amount = BigInt(amountStr);
    if (amount <= 0n) {
      alert('Valor deve ser maior que zero');
      return;
    }
    
    try {
      // No modo hacker, pula as validações de saldo e autorização
      if (!hackerMode) {
        // Check current balance for the specific year
        const currentBalance = await contract.balanceOfAreaYear(account, area, year);
        if (currentBalance < amount) {
          alert(`Saldo insuficiente para o ano ${year}. Disponível: ${currentBalance.toString()}`);
          return;
        }
        
        // Check if company is allowed for area
        const isAllowed = await contract.isCompanyAllowedForArea(companyAddr, area);
        if (!isAllowed) {
          alert('Empresa não habilitada para esta área');
          return;
        }
      } else {
        // Modo hacker: avisos mas continua
        const currentBalance = await contract.balanceOfAreaYear(account, area, year);
        const isAllowed = await contract.isCompanyAllowedForArea(companyAddr, area);
        
        if (currentBalance < amount) {
          txLog.textContent += `⚠️ MODO HACKER: Tentando pagar ${amount} com saldo ${currentBalance}...\n`;
        }
        if (!isAllowed) {
          txLog.textContent += `⚠️ MODO HACKER: Tentando pagar empresa não autorizada...\n`;
        }
      }
      
      const company = companies.get(companyAddr);
      const companyName = company ? company.name : shorten(companyAddr);
      
      const tx = await contract.payCompany(companyAddr, area, year, amount);
      txLog.textContent += `payCompany(${companyName}, ${b32ToLabel(area)}, ${year}, ${amount}) => ${tx.hash}\n`;
      await tx.wait();
      
      // Refresh balances
      await renderBalances(areas);
      
      // Clear form
      paymentYear.value = "";
      paymentAmount.value = "";
      paymentCompany.selectedIndex = 0;
      paymentArea.selectedIndex = 0;
      
      txLog.textContent += `✅ Pagamento concluído! Tokens DCT mintados para ${companyName}\n`;
    } catch (e) {
      console.error(e);
      if (hackerMode) {
        txLog.textContent += `💥 CONTRATO INTELIGENTE REJEITOU: ${e?.message || e}\n`;
        txLog.textContent += `🛡️ As regras do contrato são IMUTÁVEIS - mesmo no 'modo hacker'!\n`;
      } else {
        txLog.textContent += `Falha: ${e?.message || e}\n`;
      }
    }
  }

  function subscribeEvents() {
    provider.on('accountsChanged', () => location.reload());
    provider.on('chainChanged', () => location.reload());
    contract.on('PaidCompany', async (agency, company, ano, area) => {
      // Refresh balances if this agency made the payment
      if (agency.toLowerCase() === account.toLowerCase()) {
        await renderBalances(areas);
      }
    });
    contract.on('TransferAreaYear', async (from, to, ano, area) => {
      if (from.toLowerCase() === account.toLowerCase() || to.toLowerCase() === account.toLowerCase()) {
        await renderBalances(areas);
      }
    });
  }

  // Event listeners
  connectBtn.addEventListener('click', connect);
  btnPay.addEventListener('click', onPay);
  
  // Hacker mode toggle com teclas secretas (Ctrl+Shift+H)
  document.addEventListener('keydown', (e) => {
    // Ctrl+Shift+H para ativar/desativar modo hacker
    if (e.ctrlKey && e.shiftKey && e.key === 'H') {
      e.preventDefault();
      
      hackerMode = !hackerMode;
      
      if (hackerMode) {
        document.body.classList.add('hacker-mode');
        hackerLabel.style.display = 'block';
        // No modo hacker, habilita o botão mesmo se não for agência
        btnPay.disabled = false;
        txLog.textContent += `💀 MODO HACKER ATIVADO! Validações frontend desabilitadas...\n`;
        txLog.textContent += `⚠️ ATENÇÃO: O contrato inteligente ainda aplica suas regras!\n`;
        txLog.textContent += `🎯 Combinação secreta detectada: Ctrl+Shift+H\n\n`;
      } else {
        document.body.classList.remove('hacker-mode');
        hackerLabel.style.display = 'none';
        // Restaura a validação de agência
        if (contract && account) {
          contract.isAgency(account).then(isAgency => {
            btnPay.disabled = !isAgency;
          });
        }
        txLog.textContent += `🛡️ Modo hacker desativado. Validações restauradas.\n\n`;
      }
      
      // Atualiza a lista de empresas para refletir o modo atual
      updateCompanyDropdown();
    }
  });
  
  // Auto-select area when balance is clicked (convenience)
  balancesTable.addEventListener('click', (e) => {
    if (e.target.tagName === 'TD' && e.target.cellIndex === 0) {
      const areaText = e.target.textContent.trim();
      // Find corresponding option in area dropdown
      for (let i = 0; i < paymentArea.options.length; i++) {
        if (b32ToLabel(paymentArea.options[i].value) === areaText) {
          paymentArea.selectedIndex = i;
          paymentArea.dispatchEvent(new Event('change'));
          break;
        }
      }
    }
  });
})();
