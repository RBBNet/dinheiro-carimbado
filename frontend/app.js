(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // Minimal ABI slice
  const abi = [
    "function isLegislator(address) view returns (bool)",
    "function isArea(bytes32) view returns (bool)",
    "function budget(uint16, bytes32) view returns (uint256 cap, uint256 minted)",
    "function totalMintedAreaYear(bytes32, uint16) view returns (uint256)",
    "function setBudget(uint16 ano, bytes32 area, uint256 cap)",
    "event AreaAdded(bytes32 indexed area)",
    "event AreaRemoved(bytes32 indexed area)",
    "event BudgetSet(uint16 indexed ano, bytes32 indexed area, uint256 cap)",
    "event PaidCompany(address indexed agency, address indexed company, uint16 indexed ano, bytes32 area, uint256 amount)",
  ];

  let provider, signer, contract;
  let account, network;

  // UI bindings
  const contractInput = $("#contractAddress");
  const saveAddressBtn = $("#saveAddress");
  const connectBtn = $("#connectBtn");
  const status = $("#status");
  const accountSpan = $("#account");
  const networkSpan = $("#network");
  const isLegSpan = $("#isLegislator");
  const areasList = $("#areasList");
  const budgetsTable = $("#budgetsTable");
  const perAreaCaps = $("#perAreaCaps");
  const newYear = $("#newYear");
  const submitBudget = $("#submitBudget");
  const txLog = $("#txLog");

  function setStatus(text) { status.textContent = text; }

  // Read-only: contract address is managed on the menu page
  function getSavedAddress() {
    return localStorage.getItem("dc_contract") || "";
  }

  // NEW: validate contract address actually has code on current network
  async function assertContractDeployed(addr) {
    if (!ethers.isAddress(addr)) {
      throw new Error("Endereço do contrato inválido.");
    }
    const code = await provider.getCode(addr);
    if (!code || code === "0x") {
      throw new Error("Nenhum contrato encontrado nesse endereço na rede atual.");
    }
  }

  function loadSavedAddress() {
    const saved = getSavedAddress();
    // Only try to reflect into the input if it exists in this page
    if (saved && contractInput) contractInput.value = saved;
  }

  function saveAddress() {
    const addr = contractInput.value.trim();
    if (!addr) return;
    localStorage.setItem("dc_contract", addr);
    setStatus("Contrato salvo.");
    if (provider && signer) initContract();
  }

  async function connect() {
    if (!window.ethereum) {
      alert("MetaMask não encontrada.");
      return;
    }
    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    account = await signer.getAddress();
    const net = await provider.getNetwork();
    network = `${net.name} (${net.chainId})`;

    accountSpan.textContent = account;
    networkSpan.textContent = network;
    setStatus("Conectado.");
    await initContract();
  }

  async function initContract() {
    console.log("initContract: Iniciando inicialização do contrato...");
    setStatus("Iniciando contrato...");
    try {
  const addr = getSavedAddress();
      console.log("initContract: Endereço informado:", addr);
      if (!addr) {
        console.warn("initContract: Endereço do contrato vazio");
        setStatus("Erro: endereço do contrato vazio.");
        return;
      }

      // Validate address and bytecode presence
      await assertContractDeployed(addr);

      setStatus(`Instanciando contrato em ${addr}...`);
      contract = new ethers.Contract(addr, abi, signer);
      console.log("initContract: Contrato instanciado:", contract);

      setStatus("Atualizando identidade do usuário...");
      try {
        await refreshIdentity();
      } catch (e) {
        console.error("initContract: ABI incompatível ao chamar isLegislator:", e);
        throw new Error("Contrato incompatível com a ABI esperada (isLegislator). Verifique se o endereço e a rede estão corretos.");
      }
      console.log("initContract: Identidade atualizada, usuário é legislador?", isLegSpan.textContent);

      setStatus("Descobrindo áreas...");
      const areas = await discoverAreas();
      console.log("initContract: Áreas ativas encontradas:", areas);

      setStatus("Renderizando lista de áreas...");
      renderAreas(areas);
      console.log("initContract: Áreas renderizadas no UI");

      setStatus("Montando formulário de novos orçamentos...");
      renderNewBudgetForm(areas);
      console.log("initContract: Formulário de orçamento preparado");

      setStatus("Renderizando orçamentos existentes...");
      await renderBudgets(areas);
      console.log("initContract: Orçamentos renderizados");

      setStatus("Inscrevendo em eventos do contrato...");
      subscribeEvents();
      console.log("initContract: Inscrição em eventos concluída");

      setStatus("Contrato inicializado com sucesso.");
    } catch (e) {
      console.error("initContract: Erro ao inicializar contrato:", e);
      setStatus("Erro ao iniciar contrato: " + (e.message || e));
    }
  }

  async function refreshIdentity() {
    const isLeg = await contract.isLegislator(account);
    isLegSpan.textContent = isLeg ? "Sim" : "Não";
    submitBudget.disabled = !isLeg;
  }

  // Descobrir áreas olhando os eventos (desde o bloco 0, ambiente local)
  async function discoverAreas() {
    const topicAdded = contract.interface.getEvent("AreaAdded").topicHash;
    const topicRemoved = contract.interface.getEvent("AreaRemoved").topicHash;
    const filter = { address: contract.target, fromBlock: 0n, toBlock: "latest", topics: [[topicAdded, topicRemoved]] };
    const logs = await provider.getLogs(filter);
    const areas = new Map(); // bytes32 -> active
    for (const log of logs) {
      try {
        const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
        if (parsed && parsed.args) {
          const area = parsed.args.area;
          if (parsed.name === "AreaAdded") areas.set(area, true);
          else if (parsed.name === "AreaRemoved") areas.set(area, false);
        }
      } catch (e) {
        console.warn('Failed to parse area log:', e);
      }
    }
    return [...areas.entries()].filter(([, active]) => active).map(([area]) => area);
  }

  function b32ToLabel(b32) {
    try { return ethers.decodeBytes32String(b32); } catch { return b32; }
  }

  async function renderBudgets(areas) {
    // Descobrir anos definidos via BudgetSet
    const topic = contract.interface.getEvent("BudgetSet").topicHash;
    const logs = await provider.getLogs({ address: contract.target, fromBlock: 0n, toBlock: "latest", topics: [topic] });
    const years = new Set();
    for (const log of logs) {
      try {
        const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
        if (parsed && parsed.args) {
          years.add(Number(parsed.args.ano));
        }
      } catch (e) {
        console.warn('Failed to parse budget log:', e);
      }
    }
    const yearsArr = [...years].sort();

    let html = '<table><thead><tr><th>Ano</th><th>Área</th><th>Cap</th><th>Emitido</th><th>Realizado</th></tr></thead><tbody>';
    for (const ano of yearsArr) {
      for (const area of areas) {
        const { cap, minted } = await contract.budget(ano, area);
        const realized = await contract.totalMintedAreaYear(area, ano).then(v => v.toString());
        html += `<tr>
          <td>${ano}</td>
          <td>${b32ToLabel(area)}</td>
          <td>${cap}</td>
          <td>${minted}</td>
          <td>${realized}</td>
        </tr>`;
      }
    }
    html += '</tbody></table>';
    budgetsTable.innerHTML = html;
  }

  function renderAreas(areas) {
    if (!areas.length) { areasList.textContent = 'Nenhuma área encontrada.'; return; }
    areasList.innerHTML = areas.map(a => `<code>${b32ToLabel(a)}</code>`).join(' • ');
  }

  function renderNewBudgetForm(areas) {
    perAreaCaps.innerHTML = '';
    for (const a of areas) {
      const label = b32ToLabel(a);
      const id = `cap_${a}`;
      const row = document.createElement('div');
      row.className = 'form-grid';
      row.innerHTML = `<div><label>${label}</label></div><div><input type="number" min="0" step="1" id="${id}" placeholder="0" /></div>`;
      perAreaCaps.appendChild(row);
    }
  }

  async function onSubmitBudget() {
    txLog.textContent = '';
    const year = Number(newYear.value);
    if (!Number.isInteger(year) || year < 0 || year > 65535) { alert('Ano inválido'); return; }

    const areas = $$('#perAreaCaps input').map(inp => inp.id.replace('cap_',''));
    for (const a of areas) {
      const val = document.getElementById(`cap_${a}`).value;
      if (val === '' || Number(val) < 0) continue;
      try {
        const tx = await contract.setBudget(year, a, BigInt(val));
        txLog.textContent += `setBudget(${year}, ${b32ToLabel(a)}, ${val}) => ${tx.hash}\n`;
        await tx.wait();
      } catch (e) {
        console.error(e);
        txLog.textContent += `Falha em ${b32ToLabel(a)}: ${e?.message || e}\n`;
      }
    }
    // Refresh
    const activeAreas = await discoverAreas();
    await renderBudgets(activeAreas);
  }

  function subscribeEvents() {
    provider.on('accountsChanged', () => location.reload());
    provider.on('chainChanged', () => location.reload());
    contract.on('BudgetSet', async () => {
      const activeAreas = await discoverAreas();
      await renderBudgets(activeAreas);
    });
  }

  // Event listeners
  connectBtn.addEventListener('click', connect);
  if (saveAddressBtn) saveAddressBtn.addEventListener('click', () => {/* ignorado aqui; salvar é feito no menu */});
  submitBudget.addEventListener('click', onSubmitBudget);
  loadSavedAddress();
})();
