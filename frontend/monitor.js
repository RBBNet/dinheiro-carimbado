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
    "event BudgetSet(uint16 indexed ano, bytes32 indexed area, uint256 cap)",
    "event MintToAgency(address indexed to, bytes32 indexed area, uint16 indexed ano, uint256 amount)",
  "event PaidCompany(address indexed agency, address indexed company, uint16 indexed ano, bytes32 area, uint256 amount, string agencyName, string companyName)",
    "event TransferAreaYear(address indexed from, address indexed to, uint16 indexed ano, bytes32 area, uint256 amount)",
    "event Settled(address indexed company, bytes32 indexed area, uint16 indexed ano, uint256 amount, bytes32 offchainRef)",
  ];

  let provider, contract;
  const seenLogs = new Set(); // txHash#logIndex
  const blockTimeCache = new Map(); // blockNumber -> Date

  function formatTs(blockNumber) {
    return blockTimeCache.get(blockNumber)?.toLocaleString('pt-BR') || '';
  }

  async function ensureBlockTime(blockNumber) {
    if (!blockTimeCache.has(blockNumber)) {
      const blk = await provider.getBlock(blockNumber);
      blockTimeCache.set(blockNumber, new Date(Number(blk.timestamp) * 1000));
    }
  }

  function renderEvent(name, data, log) {
    // log: { transactionHash, logIndex, blockNumber }
    const id = `${log.transactionHash}#${log.logIndex}`;
    if (seenLogs.has(id)) return;
    seenLogs.add(id);

    const el = document.createElement('div');
    el.className = 'event-item';
    el.innerHTML = `
      <div class="event-header">
        <span class="badge ${name}">${name}</span>
        <span class="evt-time" data-block="${log.blockNumber}">...</span>
      </div>
      <div class="evt-body">
        ${Object.entries(data).map(([k,v]) =>
          `<div class="field"><label>${k}</label><span>${v}</span></div>`).join('')}
        <div class="field full"><label>Tx Hash</label><span class="tx-hash">${log.transactionHash}</span></div>
      </div>
    `;
    eventsLog.prepend(el);
    // limit
    const all = eventsLog.querySelectorAll('.event-item');
    if (all.length > 100) all[all.length - 1].remove();
  }

  async function handleRuntimeEvent(evName, args, ev) {
    try {
      await ensureBlockTime(ev.blockNumber);
      const base = { bloco: ev.blockNumber };
      let payload;
      switch (evName) {
        case 'BudgetSet':
          payload = { ...base, ano: args[0], area: bytes32ToStr(args[1]), cap: args[2] };
          break;
        case 'MintToAgency':
          payload = { ...base, to: shorten(args[0]), area: bytes32ToStr(args[1]), ano: args[2], amount: args[3] };
          break;
        case 'PaidCompany':
          payload = { ...base, agency: shorten(args[0]), company: shorten(args[1]), ano: args[2],
            area: bytes32ToStr(args[3]), amount: args[4], agencyName: args[5], companyName: args[6] };
          break;
        case 'TransferAreaYear':
          payload = { ...base, from: shorten(args[0]), to: shorten(args[1]), ano: args[2],
            area: bytes32ToStr(args[3]), amount: args[4] };
          break;
        case 'CompanyUpsert':
          payload = { ...base, empresa: shorten(args[0]), cnpj: args[1], name: args[2], active: args[3] };
          break;
        case 'CompanyAreaSet':
          payload = { ...base, empresa: shorten(args[0]), area: bytes32ToStr(args[1]), allowed: args[2] };
          break;
        case 'Settled':
          payload = { ...base, company: shorten(args[0]), area: bytes32ToStr(args[1]), ano: args[2], amount: args[3], ref: args[4] };
          break;
        default:
          payload = { ...base };
      }
      renderEvent(evName, payload, ev);
      // update timestamp text
      const timeSpan = eventsLog.querySelector(`.event-item .evt-time[data-block="${ev.blockNumber}"]`);
      if (timeSpan) timeSpan.textContent = formatTs(ev.blockNumber);
    } catch (e) {
      console.error('Erro processando evento runtime', evName, e);
    }
  }

  function attachListeners() {
    if (!contract) return;
    contract.removeAllListeners();
    const listen = (name) => {
      contract.on(name, (...runtimeArgs) => {
        const ev = runtimeArgs[runtimeArgs.length - 1]; // last arg = Event
        const pureArgs = runtimeArgs.slice(0, runtimeArgs.length - 1);
        handleRuntimeEvent(name, pureArgs, ev);
      });
    };
    [
      'CompanyUpsert','CompanyAreaSet','BudgetSet','MintToAgency',
      'TransferAreaYear','PaidCompany','Settled'
    ].forEach(listen);
    console.log('Listeners instalados.');
  }

  async function backfillRecent() {
    if (!contract || !provider) return;
    try {
      const latest = await provider.getBlockNumber();
      const from = latest > 1500 ? latest - 1500 : 0;
      const events = [
        'CompanyUpsert','CompanyAreaSet','BudgetSet','MintToAgency',
        'TransferAreaYear','PaidCompany','Settled'
      ];
      for (const evName of events) {
        const filter = contract.filters[evName];
        if (!filter) continue;
        const logs = await contract.queryFilter(filter, from, latest);
        for (const log of logs) {
          await ensureBlockTime(log.blockNumber);
          handleRuntimeEvent(evName, log.args, log);
        }
      }
      // atualizar timestamps atrasados
      document.querySelectorAll('.evt-time').forEach(span => {
        const bn = Number(span.dataset.block);
        span.textContent = formatTs(bn);
      });
      console.log('Backfill concluído.');
    } catch (e) {
      console.error('Backfill falhou', e);
    }
  }

  // Botão “Limpar Log” deve também limpar set (se quer permitir reaparecer no backfill remova a linha seenLogs.clear()):
  clearBtn?.addEventListener('click', () => {
    eventsLog.innerHTML = '';
    seenLogs.clear();
    console.log('Log limpo.');
  });

  // Em connect() depois de instanciar contract:
  // attachListeners();
  // await backfillRecent();

  // Filter checkboxes
  const filterCheckboxes = {
    CompanyUpsert: $("#filterCompanyUpsert"),
    CompanyAreaSet: $("#filterCompanyAreaSet"),
    BudgetSet: $("#filterBudgetSet"),
    MintToAgency: $("#filterMintToAgency"),
    TransferAreaYear: $("#filterTransferAreaYear"),
    PaidCompany: $("#filterPaidCompany")
  };

  // Utility functions
  function shorten(addr) {
    if (!addr || addr.length < 10) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }

  function b32ToLabel(b32) {
    if (!b32 || b32 === "0x0000000000000000000000000000000000000000000000000000000000000000") return "";
    const hex = b32.slice(2);
    let result = "";
    for (let i = 0; i < hex.length; i += 2) {
      const byte = parseInt(hex.slice(i, i + 2), 16);
      if (byte === 0) break;
      result += String.fromCharCode(byte);
    }
    return result;
  }

  function formatTimestamp() {
    return new Date().toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function updateStatus(connected) {
    isConnected = connected;
    connectionStatus.className = `status-dot ${connected ? 'online' : 'offline'}`;
    statusText.textContent = connected ? 'Conectado' : 'Desconectado';
    connectBtn.textContent = connected ? '🔌 Reconectar' : '🔌 Conectar ao Blockchain';
  }

  function clearWelcomeMessage() {
    if (eventsLog.querySelector('.welcome-message')) {
      eventsLog.innerHTML = '';
    }
  }

  // Removed legacy createEventElement/setupEventListeners path (was causing duplicates & missing hashes)

  async function backfillRecent() {
    if (!contract || !provider) return;
    try {
      const latest = await provider.getBlockNumber();
      const from = latest > 1500 ? latest - 1500 : 0;
      const events = [
        'CompanyUpsert','CompanyAreaSet','BudgetSet','MintToAgency',
        'TransferAreaYear','PaidCompany','Settled'
      ];
      for (const evName of events) {
        const filter = contract.filters[evName];
        if (!filter) continue;
        const logs = await contract.queryFilter(filter, from, latest);
        for (const log of logs) {
          await ensureBlockTime(log.blockNumber);
          handleRuntimeEvent(evName, log.args, log);
        }
      }
      // atualizar timestamps atrasados
      document.querySelectorAll('.evt-time').forEach(span => {
        const bn = Number(span.dataset.block);
        span.textContent = formatTs(bn);
      });
      console.log('Backfill concluído.');
    } catch (e) {
      console.error('Backfill falhou', e);
    }
  }

  async function connect() {
    try {
      if (!window.ethereum) {
        alert('MetaMask não encontrado! Instale o MetaMask para continuar.');
        return;
      }

      provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);

      const network = await provider.getNetwork();
      networkName.textContent = network.name || `Chain ${network.chainId}`;

      // Get contract address from input or localStorage
      let addr = (addrInput && addrInput.value.trim()) || localStorage.getItem('dinheiroCarimbadoAddress');
      if (!addr) {
        addr = prompt('Digite o endereço do contrato DinheiroCarimbado:') || '';
      }
      if (addr && ethers.isAddress(addr)) {
        localStorage.setItem('dinheiroCarimbadoAddress', addr);
        if (addrInput) addrInput.value = addr;
      }

      if (!addr) {
        throw new Error('Endereço do contrato não fornecido');
      }

      contract = new ethers.Contract(addr, abi, provider);
      contractAddress.textContent = shorten(addr);

      // Get latest block number
      const blockNumber = await provider.getBlockNumber();
      lastBlock.textContent = blockNumber.toString();

  // Setup (single) deduplicated listeners
  attachListeners();
  // Optional initial backfill to show recent history without duplicates
  await backfillRecent();

      updateStatus(true);
      console.log('Monitor conectado com sucesso!');

      // Update block number periodically
      setInterval(async () => {
        if (isConnected) {
          try {
            const blockNumber = await provider.getBlockNumber();
            lastBlock.textContent = blockNumber.toString();
          } catch (error) {
            console.error('Erro ao atualizar número do bloco:', error);
          }
        }
      }, 15000); // Update every 15 seconds

    } catch (error) {
      console.error('Erro ao conectar:', error);
      alert('Erro ao conectar: ' + (error.message || error));
      updateStatus(false);
    }
  }

  function clearLog() {
    eventsLog.innerHTML = `
      <div class="welcome-message">
        <div class="pulse-icon">📡</div>
        <p>Log de eventos limpo</p>
        <p class="subtitle">Aguardando novos eventos...</p>
      </div>
    `;
  }

  // Event listeners
  connectBtn.addEventListener('click', connect);
  clearBtn.addEventListener('click', clearLog);
  backfillBtn?.addEventListener('click', backfillRecent);
  saveAddrBtn?.addEventListener('click', () => {
    const v = addrInput.value.trim();
    if (!v) { alert('Informe um endereço'); return; }
    if (!ethers.isAddress(v)) { alert('Endereço inválido'); return; }
    localStorage.setItem('dinheiroCarimbadoAddress', v);
    contractAddress.textContent = shorten(v);
    if (isConnected) connect();
  });
  clearAddrBtn?.addEventListener('click', () => {
    localStorage.removeItem('dinheiroCarimbadoAddress');
    if (addrInput) addrInput.value = '';
    contractAddress.textContent = '-';
    alert('Endereço removido. Informe outro e reconecte.');
  });

  // Preload stored address into input
  (function preloadAddress(){
    const stored = localStorage.getItem('dinheiroCarimbadoAddress');
    if (stored && addrInput) addrInput.value = stored;
  })();

  // Filter change handlers
  Object.values(filterCheckboxes).forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      console.log(`Filtro ${checkbox.id} ${checkbox.checked ? 'ativado' : 'desativado'}`);
    });
  });

  // Auto-connect on page load if MetaMask is available
  if (window.ethereum) {
    window.ethereum.on('accountsChanged', () => {
      location.reload();
    });
    window.ethereum.on('chainChanged', () => {
      location.reload();
    });
  }

  console.log('Sistema de monitoramento inicializado');
})();
