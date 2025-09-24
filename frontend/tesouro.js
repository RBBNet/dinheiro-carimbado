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
    "event RoleSet(string role, address indexed who, bool enabled)",
    "event AgencyNameSet(address indexed agency, string name)",
    "event AreaAdded(bytes32 indexed area)",
    "event AreaRemoved(bytes32 indexed area)",
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

      // areas from events
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

  async function discoverAreas() {
  const topicAdded = ethers.id("AreaAdded(bytes32)");
  const topicRemoved = ethers.id("AreaRemoved(bytes32)");
  const filter = { address: contract.target, fromBlock: 0n, toBlock: "latest", topics: [[topicAdded, topicRemoved]] };
    const logs = await provider.getLogs(filter);
    const areas = new Map();
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
    // Get agencies from RoleSet events
    const topicRoleSet = ethers.id("RoleSet(string,address,bool)");
    const logs = await provider.getLogs({ address: contract.target, fromBlock: 0n, toBlock: "latest", topics: [topicRoleSet] });
    const agencies = new Set();
    for (const log of logs) {
      try {
        const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
        if (parsed && parsed.args) {
          if (parsed.args.role === "AGENCY" && parsed.args.enabled) {
            agencies.add(parsed.args.who);
          }
          if (parsed.args.role === "AGENCY" && !parsed.args.enabled) {
            agencies.delete(parsed.args.who);
          }
        }
      } catch (e) {
        console.warn('Failed to parse role set log:', e);
      }
    }
    const active = [...agencies];
    allocAgency.innerHTML = "";
    if (!active.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Nenhuma agência encontrada";
      allocAgency.appendChild(opt);
      return;
    }
    
    // Fetch names from contract and populate options
    for (const address of active) {
      const opt = document.createElement("option");
      opt.value = address;
      opt.title = address; // show address on hover
      
      try {
        const name = await contract.agencyNames(address);
        opt.textContent = name || shorten(address);
      } catch {
        opt.textContent = shorten(address);
      }
      
      allocAgency.appendChild(opt);
    }
  }

  async function renderBudgets(areas) {
  const topic = ethers.id("BudgetSet(uint16,bytes32,uint256)");
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

    let html = '<table><thead><tr><th>Ano</th><th>Área</th><th>Total (cap)</th><th>Emitido</th></tr></thead><tbody>';
    for (const ano of yearsArr) {
      for (const area of areas) {
        const { cap, minted } = await contract.budget(ano, area);
        html += `<tr>
          <td>${ano}</td>
          <td>${b32ToLabel(area)}</td>
          <td>${cap}</td>
          <td>${minted}</td>
        </tr>`;
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
