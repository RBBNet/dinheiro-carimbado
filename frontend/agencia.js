(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const abi = [
    "function isAgency(address) view returns (bool)",
    "function isArea(bytes32) view returns (bool)",
    "function balanceOfAreaYear(address, bytes32, uint16) view returns (uint256)",
    "function agencyNames(address) view returns (string)",
    "function transferAgencyToAgency(address para, bytes32 area, uint16 ano, uint256 amount)",
    // Novos getters evitando varredura de eventos
    "function getAreas() view returns (bytes32[])",
    "function getAgencies() view returns (address[])",
    "function getBudgetYears() view returns (uint16[])",
    // Evento necessário apenas para atualização em tempo real
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
    if (!contract.getAreas) return [];
    try { return await contract.getAreas(); } catch { return []; }
  }

  async function renderBalances(areas) {
    balancesTable.innerHTML = 'Carregando…';
    let years = [];
    if (contract.getBudgetYears) {
      try { years = await contract.getBudgetYears(); } catch {}
    }
    // fallback: limited sliding window if no budget years
    if (!years.length) {
      const currentYear = new Date().getFullYear();
      for (let y = currentYear - 2; y <= currentYear + 2; y++) years.push(y);
    }
    let rows = '';
    for (const ano of years) {
      for (const area of areas) {
        try {
          const bal = await contract.balanceOfAreaYear(account, area, ano);
          if (bal > 0n) {
            rows += `<tr><td>${ano}</td><td>${b32ToLabel(area)}</td><td>${bal}</td></tr>`;
          }
        } catch {}
      }
    }
    if (!rows) rows = '<tr><td colspan="3" style="text-align:center;color:#666;">Nenhum saldo disponível</td></tr>';
    balancesTable.innerHTML = `<table><thead><tr><th>Ano</th><th>Área</th><th>Saldo</th></tr></thead><tbody>${rows}</tbody></table>`;
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
    transferToAgency.innerHTML = '';
    let list = [];
    if (contract.getAgencies) {
      try { list = await contract.getAgencies(); } catch {}
    }
    list = list.filter(a => a.toLowerCase() !== account.toLowerCase());
    if (!list.length) {
      const opt = document.createElement('option');
      opt.value = ''; opt.textContent = 'Nenhuma outra agência encontrada';
      transferToAgency.appendChild(opt);
      return;
    }
    const placeholder = document.createElement('option');
    placeholder.value=''; placeholder.textContent='Selecione uma agência';
    transferToAgency.appendChild(placeholder);
    for (const addr of list) {
      const opt = document.createElement('option'); opt.value = addr; opt.title = addr;
      try { const name = await contract.agencyNames(addr); opt.textContent = name || shorten(addr); }
      catch { opt.textContent = shorten(addr); }
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
