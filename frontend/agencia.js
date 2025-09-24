(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const abi = [
    "function isAgency(address) view returns (bool)",
    "function isArea(bytes32) view returns (bool)",
    "function balanceOfAreaYear(address, bytes32, uint16) view returns (uint256)",
    "function totalSupplyArea(bytes32) view returns (uint256)",
    "function agencyNames(address) view returns (string)",
    "function transferAgencyToAgency(address para, bytes32 area, uint16 ano, uint256 amount)",
    "event RoleSet(string role, address indexed who, bool enabled)",
    "event AreaAdded(bytes32 indexed area)",
    "event AreaRemoved(bytes32 indexed area)",
    "event TransferAreaYear(address indexed from, address indexed to, uint16 indexed ano, bytes32 area, uint256 amount)",
  ];

  let provider, signer, contract;
  let account;

  const connectBtn = $("#connectBtn");
  const status = $("#status");
  const accountSpan = $("#account");
  const networkSpan = $("#network");
  const isAgencySpan = $("#isAgency");
  const agencyNameSpan = $("#agencyName");
  const balancesTable = $("#balancesTable");
  const transferYear = $("#transferYear");
  const transferArea = $("#transferArea");
  const transferToAgency = $("#transferToAgency");
  const transferAmount = $("#transferAmount");
  const btnTransfer = $("#btnTransfer");
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
      btnTransfer.disabled = !isAgency;

      if (isAgency) {
        // Get agency name
        try {
          const name = await contract.agencyNames(account);
          agencyNameSpan.textContent = name || shorten(account);
        } catch {
          agencyNameSpan.textContent = shorten(account);
        }

        // Load areas and balances
        const areas = await discoverAreas();
        await renderBalances(areas);
        await populateAreas(areas);
        await populateOtherAgencies();

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
    const areas = new Map();
    for (const log of logs) {
      try {
        const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
        const area = parsed.args.area;
        if (parsed.name === "AreaAdded") areas.set(area, true);
        else if (parsed.name === "AreaRemoved") areas.set(area, false);
      } catch {}
    }
    return [...areas.entries()].filter(([, active]) => active).map(([area]) => area);
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
    transferArea.innerHTML = "";
    for (const area of areas) {
      const opt = document.createElement("option");
      opt.value = area;
      opt.textContent = b32ToLabel(area);
      transferArea.appendChild(opt);
    }
  }

  async function populateOtherAgencies() {
    // Get all agencies from RoleSet events
    const topicRoleSet = ethers.id("RoleSet(string,address,bool)");
    const logs = await provider.getLogs({ address: contract.target, fromBlock: 0n, toBlock: "latest", topics: [topicRoleSet] });
    const agencies = new Set();
    for (const log of logs) {
      try {
        const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
        if (parsed && parsed.args && parsed.args.role === "AGENCY" && parsed.args.enabled) {
          agencies.add(parsed.args.who);
        }
        if (parsed && parsed.args && parsed.args.role === "AGENCY" && !parsed.args.enabled) {
          agencies.delete(parsed.args.who);
        }
      } catch (e) {
        console.warn('Failed to parse RoleSet log:', e);
      }
    }
    
    // Remove current account from the list
    agencies.delete(account);
    const otherAgencies = [...agencies];
    
    transferToAgency.innerHTML = "";
    if (!otherAgencies.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Nenhuma outra agência encontrada";
      transferToAgency.appendChild(opt);
      return;
    }
    
    // Add placeholder option
    const placeholderOpt = document.createElement("option");
    placeholderOpt.value = "";
    placeholderOpt.textContent = "Selecione uma agência";
    transferToAgency.appendChild(placeholderOpt);
    
    // Fetch names and populate options
    for (const address of otherAgencies) {
      const opt = document.createElement("option");
      opt.value = address;
      opt.title = address; // show address on hover
      
      try {
        const name = await contract.agencyNames(address);
        opt.textContent = name || shorten(address);
      } catch {
        opt.textContent = shorten(address);
      }
      
      transferToAgency.appendChild(opt);
    }
  }

  async function onTransfer() {
    txLog.textContent = "";
    const year = Number(transferYear.value);
    const area = transferArea.value;
    const toAgency = transferToAgency.value;
    const amountStr = transferAmount.value.trim();
    
    if (!Number.isInteger(year) || year < 0 || year > 65535) {
      alert('Ano inválido');
      return;
    }
    
    if (!area || !toAgency || amountStr === '') { 
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
      
      const tx = await contract.transferAgencyToAgency(toAgency, area, year, amount);
      txLog.textContent += `transferAgencyToAgency(${shorten(toAgency)}, ${b32ToLabel(area)}, ${year}, ${amount}) => ${tx.hash}\n`;
      await tx.wait();
      
      // Refresh balances
      const areas = await discoverAreas();
      await renderBalances(areas);
      
      // Clear form
      transferYear.value = "";
      transferAmount.value = "";
      transferToAgency.selectedIndex = 0;
      
      txLog.textContent += `✅ Transferência concluída com sucesso!\n`;
    } catch (e) {
      console.error(e);
      txLog.textContent += `Falha: ${e?.message || e}\n`;
    }
  }

  function subscribeEvents() {
    provider.on('accountsChanged', () => location.reload());
    provider.on('chainChanged', () => location.reload());
    contract.on('TransferAreaYear', async (from, to, ano, area) => {
      // Refresh balances if this agency is involved in the transfer
      if (from.toLowerCase() === account.toLowerCase() || to.toLowerCase() === account.toLowerCase()) {
        const areas = await discoverAreas();
        await renderBalances(areas);
      }
    });
  }

  // Event listeners
  connectBtn.addEventListener('click', connect);
  btnTransfer.addEventListener('click', onTransfer);
  
  // Auto-select area when balance is clicked (convenience)
  balancesTable.addEventListener('click', (e) => {
    if (e.target.tagName === 'TD' && e.target.cellIndex === 0) {
      const areaText = e.target.textContent.trim();
      // Find corresponding option in area dropdown
      for (let i = 0; i < transferArea.options.length; i++) {
        if (b32ToLabel(transferArea.options[i].value) === areaText) {
          transferArea.selectedIndex = i;
          break;
        }
      }
    }
  });
})();
