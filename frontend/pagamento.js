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
    "function payCompany(address empresa, bytes32 area, uint16 ano, uint256 amount)",
    "event RoleSet(string role, address indexed who, bool enabled)",
    "event AreaAdded(bytes32 indexed area)",
    "event AreaRemoved(bytes32 indexed area)",
    "event CompanyUpsert(address indexed empresa, bytes14 cnpj, string name, bool active)",
    "event CompanyAreaSet(address indexed empresa, bytes32 indexed area, bool allowed)",
    "event PaidCompany(address indexed agency, address indexed company, uint16 indexed ano, bytes32 area, uint256 amount)",
    "event TransferAreaYear(address indexed from, address indexed to, uint16 indexed ano, bytes32 area, uint256 amount)",
  ];

  let provider, signer, contract;
  let account;
  let areas = [];
  let companies = new Map(); // address -> {cnpj, name, allowedAreas: Set}

  const connectBtn = $("#connectBtn");
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
      btnPay.disabled = !isAgency;

      if (isAgency) {
        // Get agency name
        try {
          const name = await contract.agencyNames(account);
          agencyNameSpan.textContent = name || shorten(account);
        } catch {
          agencyNameSpan.textContent = shorten(account);
        }

        // Load areas, companies, and balances
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
    const topicAdded = ethers.id("AreaAdded(bytes32)");
    const topicRemoved = ethers.id("AreaRemoved(bytes32)");
    const filter = { address: contract.target, fromBlock: 0n, toBlock: "latest", topics: [[topicAdded, topicRemoved]] };
    const logs = await provider.getLogs(filter);
    const areasMap = new Map();
    for (const log of logs) {
      try {
        const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
        if (parsed && parsed.args) {
          const area = parsed.args.area;
          if (parsed.name === "AreaAdded") areasMap.set(area, true);
          else if (parsed.name === "AreaRemoved") areasMap.set(area, false);
        }
      } catch (e) {
        console.warn('Failed to parse area log:', e);
      }
    }
    return [...areasMap.entries()].filter(([, active]) => active).map(([area]) => area);
  }

  async function discoverCompanies() {
    companies.clear();
    
    // Get CompanyUpsert events to discover companies
    const topicUpsert = ethers.id("CompanyUpsert(address,bytes14,string,bool)");
    const upsertLogs = await provider.getLogs({ 
      address: contract.target, 
      fromBlock: 0n, 
      toBlock: "latest", 
      topics: [topicUpsert] 
    });
    
    for (const log of upsertLogs) {
      try {
        const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
        if (parsed && parsed.args) {
          if (parsed.args.active) {
            companies.set(parsed.args.empresa, {
              cnpj: parsed.args.cnpj,
              name: parsed.args.name,
              allowedAreas: new Set()
            });
          } else {
            companies.delete(parsed.args.empresa);
          }
        }
      } catch (e) {
        console.warn('Failed to parse company upsert log:', e);
      }
    }
    
    // Get CompanyAreaSet events to discover allowed areas
    const topicAreaSet = ethers.id("CompanyAreaSet(address,bytes32,bool)");
    const areaLogs = await provider.getLogs({ 
      address: contract.target, 
      fromBlock: 0n, 
      toBlock: "latest", 
      topics: [topicAreaSet] 
    });
    
    for (const log of areaLogs) {
      try {
        const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
        if (parsed && parsed.args) {
          const company = companies.get(parsed.args.empresa);
          if (company) {
            if (parsed.args.allowed) {
              company.allowedAreas.add(parsed.args.area);
            } else {
              company.allowedAreas.delete(parsed.args.area);
            }
          }
        }
      } catch (e) {
        console.warn('Failed to parse company area log:', e);
      }
    }
  }

  async function renderBalances(areas) {
    // Check balances for recent years (2020-2030)
    const currentYear = new Date().getFullYear();
    const startYear = Math.max(2020, currentYear - 5);
    const endYear = currentYear + 5;
    
    let html = '<table><thead><tr><th>Ano</th><th>Área</th><th>Saldo Disponível</th></tr></thead><tbody>';
    let hasBalances = false;
    
    for (let ano = startYear; ano <= endYear; ano++) {
      for (const area of areas) {
        try {
          const balance = await contract.balanceOfAreaYear(account, area, ano);
          if (balance > 0n) {  // Only show non-zero balances
            html += `<tr>
              <td>${ano}</td>
              <td>${b32ToLabel(area)}</td>
              <td>${balance.toString()}</td>
            </tr>`;
            hasBalances = true;
          }
        } catch (e) {
          console.warn(`Failed to get balance for ${ano}/${b32ToLabel(area)}:`, e);
        }
      }
    }
    
    if (!hasBalances) {
      html += '<tr><td colspan="3" style="text-align: center; color: #666;">Nenhum saldo disponível</td></tr>';
    }
    
    html += '</tbody></table>';
    balancesTable.innerHTML = html;
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
    
    // Filter companies allowed for selected area
    const allowedCompanies = [];
    for (const [address, company] of companies.entries()) {
      if (company.allowedAreas.has(selectedArea)) {
        allowedCompanies.push({ address, ...company });
      }
    }
    
    if (allowedCompanies.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Nenhuma empresa habilitada para esta área";
      paymentCompany.appendChild(opt);
      return;
    }
    
    // Sort by name
    allowedCompanies.sort((a, b) => a.name.localeCompare(b.name));
    
    for (const company of allowedCompanies) {
      const opt = document.createElement("option");
      opt.value = company.address;
      opt.textContent = `${formatCNPJ(company.cnpj)} - ${company.name}`;
      opt.title = `${company.address} - ${company.name}`;
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
      txLog.textContent += `Falha: ${e?.message || e}\n`;
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
    contract.on('TransferArea', async (from, to, area) => {
      // Refresh balances if this agency is involved in the transfer
      if (from.toLowerCase() === account.toLowerCase() || to.toLowerCase() === account.toLowerCase()) {
        await renderBalances(areas);
      }
    });
  }

  // Event listeners
  connectBtn.addEventListener('click', connect);
  btnPay.addEventListener('click', onPay);
  
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
