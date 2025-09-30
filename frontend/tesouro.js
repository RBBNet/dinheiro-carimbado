(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const abi = [
    "function isTreasury(address) view returns (bool)",
    "function isAgency(address) view returns (bool)",
    "function isArea(bytes32) view returns (bool)",
    "function budget(uint16, bytes32) view returns (uint256 cap, uint256 minted)",
    "function totalSupplyArea(bytes32) view returns (uint256)",
    "function mintToAgency(address orgao, bytes32 area, uint16 ano, uint256 amount)",
    "function agencyNames(address) view returns (string)",
    "function getCompanyName(address) view returns (string)",
    // Novos getters usados para eliminar varredura de eventos
    "function getAreas() view returns (bytes32[])",
    "function getAgencies() view returns (address[])",
    "function getBudgetYears() view returns (uint16[])",
    "function getBudgetsForYear(uint16 ano) view returns (bytes32[] areas, uint256[] caps, uint256[] mintedValues, uint256[] realizedValues)",
    // Eventos (apenas para atualizações ao vivo, não para bootstrap)
    "event BudgetSet(uint16 indexed ano, bytes32 indexed area, uint256 cap)",
    "event MintToAgency(address indexed to, bytes32 indexed area, uint16 indexed ano, uint256 amount)",
  ];

  let provider, signer, contract;
  let account;

  const connectBtn = $("#connectBtn");
  const status = $("#status");
  const accountSpan = $("#account");
  const networkSpan = $("#network");
  const isTreasurySpan = $("#isTreasury");
  const budgetsTable = $("#budgetsTable");
  const allocYear = $("#allocYear");
  const allocArea = $("#allocArea");
  const allocAmount = $("#allocAmount");
  const allocAgency = $("#allocAgency");
  const btnAllocate = $("#btnAllocate");
  const txLog = $("#txLog");

  function setStatus(t) { status.textContent = t; }

  function getSavedAddress() {
    return localStorage.getItem("dc_contract") || "";
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

  function b32ToLabel(b32) {
    try { return ethers.decodeBytes32String(b32); } catch { return b32; }
  }

  function shorten(addr) {
    return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '';
  }

  async function initContract() {
    try {
  const addr = getSavedAddress();
      if (!addr) { setStatus("Erro: endereço do contrato vazio."); return; }
      await assertContractDeployed(addr);
      contract = new ethers.Contract(addr, abi, signer);

      // identity
      const isTreas = await contract.isTreasury(account);
      isTreasurySpan.textContent = isTreas ? "Sim" : "Não";
      btnAllocate.disabled = !isTreas;

  // areas via getter (sem logs)
      const areas = await discoverAreas();
      await renderBudgets(areas);
      await populateAreas(areas);

      // agencies from RoleSet logs
      await populateAgencies();      subscribeEvents();
      setStatus("Contrato pronto.");
    } catch (e) {
      console.error(e);
      setStatus("Erro: " + (e.message || e));
    }
  }

  // Usa view function getAreas() do contrato (evita varrer logs e limites de range)
  async function discoverAreas() {
    try {
      return await contract.getAreas();
    } catch (e) {
      console.warn('getAreas() falhou, retornando lista vazia:', e.message);
      return [];
    }
  }

  async function populateAreas(areas) {
    allocArea.innerHTML = "";
    for (const a of areas) {
      const opt = document.createElement("option");
      opt.value = a;
      opt.textContent = b32ToLabel(a);
      allocArea.appendChild(opt);
    }
  }

  async function populateAgencies() {
    allocAgency.innerHTML = "";
    let list = [];
    if (contract.getAgencies) {
      try { list = await contract.getAgencies(); } catch (e) { console.warn('getAgencies() falhou:', e.message); }
    }
    if (!list.length) {
      const opt = document.createElement('option');
      opt.value = ''; opt.textContent = 'Nenhuma agência encontrada';
      allocAgency.appendChild(opt);
      return;
    }
    for (const address of list) {
      const opt = document.createElement('option');
      opt.value = address; opt.title = address;
      try {
        const name = await contract.agencyNames(address);
        opt.textContent = name || shorten(address);
      } catch { opt.textContent = shorten(address); }
      allocAgency.appendChild(opt);
    }
  }

  async function renderBudgets(areas) {
    budgetsTable.innerHTML = 'Carregando…';
    let years = [];
    if (contract.getBudgetYears) {
      try { years = await contract.getBudgetYears(); } catch (e) { console.warn('getBudgetYears() falhou:', e.message); }
    }
    if (!years.length) { budgetsTable.textContent = 'Nenhum orçamento definido.'; return; }
    let html = '<table><thead><tr><th>Ano</th><th>Área</th><th>Cap</th><th>Minted</th><th>Realizado</th></tr></thead><tbody>';
    for (const ano of years) {
      try {
        const res = await contract.getBudgetsForYear(ano);
        const yrAreas = res.areas || res[0];
        const caps = res.caps || res[1];
        const mintedVals = res.mintedValues || res[2];
        const realizedVals = res.realizedValues || res[3];
        for (let i = 0; i < yrAreas.length; i++) {
          html += `<tr><td>${ano}</td><td>${b32ToLabel(yrAreas[i])}</td><td>${caps[i]}</td><td>${mintedVals[i]}</td><td>${realizedVals[i]}</td></tr>`;
        }
      } catch (e) {
        console.warn('getBudgetsForYear falhou ano=' + ano + ':', e.message);
      }
    }
    html += '</tbody></table>';
    budgetsTable.innerHTML = html;
  }

  async function onAllocate() {
    txLog.textContent = "";
    const year = Number(allocYear.value);
    if (!Number.isInteger(year) || year < 0 || year > 65535) { alert('Ano inválido'); return; }
    const area = allocArea.value;
    const amountStr = allocAmount.value.trim();
    const agency = allocAgency.value;
    if (!area || amountStr === '' || !agency) { alert('Preencha todos os campos'); return; }
    const amount = BigInt(amountStr);
    try {
      const tx = await contract.mintToAgency(agency, area, year, amount);
      txLog.textContent += `mintToAgency(${agency}, ${b32ToLabel(area)}, ${year}, ${amount}) => ${tx.hash}\n`;
      await tx.wait();
      const areas = await discoverAreas();
      await renderBudgets(areas);
    } catch (e) {
      console.error(e);
      txLog.textContent += `Falha: ${e?.message || e}\n`;
    }
  }

  function subscribeEvents() {
    provider.on('accountsChanged', () => location.reload());
    provider.on('chainChanged', () => location.reload());
    contract.on('BudgetSet', async () => {
      const areas = await discoverAreas();
      await renderBudgets(areas);
    });
    contract.on('MintToAgency', async () => {
      const areas = await discoverAreas();
      await renderBudgets(areas);
    });
  }

  // events
  connectBtn.addEventListener('click', connect);
  btnAllocate.addEventListener('click', onAllocate);
})();
