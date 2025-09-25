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
    "event PaidCompany(address indexed agency, address indexed company, uint16 indexed ano, bytes32 area, uint256 amount)",
    "event TransferAreaYear(address indexed from, address indexed to, uint16 indexed ano, bytes32 area, uint256 amount)",
    "event Settled(address indexed company, bytes32 indexed area, uint16 indexed ano, uint256 amount, bytes32 offchainRef)",
  ];

  let provider, contract;
  let isConnected = false;
  let eventFilters = {};

  // DOM elements
  const connectBtn = $("#connectBtn");
  const clearBtn = $("#clearBtn");
  const connectionStatus = $("#connectionStatus");
  const statusText = $("#statusText");
  const networkName = $("#networkName");
  const contractAddress = $("#contractAddress");
  const lastBlock = $("#lastBlock");
  const eventsLog = $("#eventsLog");

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

  function createEventElement(eventName, eventData, transactionHash) {
    if (!filterCheckboxes[eventName]?.checked) {
      return null;
    }

    clearWelcomeMessage();

    const eventDiv = document.createElement('div');
    eventDiv.className = 'event-item';

    const headerDiv = document.createElement('div');
    headerDiv.className = 'event-header';

    const typeSpan = document.createElement('span');
    typeSpan.className = `event-type ${eventName}`;
    typeSpan.textContent = eventName;

    const timestampSpan = document.createElement('span');
    timestampSpan.className = 'event-timestamp';
    timestampSpan.textContent = formatTimestamp();

    headerDiv.appendChild(typeSpan);
    headerDiv.appendChild(timestampSpan);

    const detailsDiv = document.createElement('div');
    detailsDiv.className = 'event-details';

    // Add event-specific fields
    const fields = getEventFields(eventName, eventData);
    fields.forEach(field => {
      const fieldDiv = document.createElement('div');
      fieldDiv.className = 'event-field';

      const labelDiv = document.createElement('div');
      labelDiv.className = 'event-field-label';
      labelDiv.textContent = field.label;

      const valueDiv = document.createElement('div');
      valueDiv.className = 'event-field-value';
      valueDiv.textContent = field.value;

      fieldDiv.appendChild(labelDiv);
      fieldDiv.appendChild(valueDiv);
      detailsDiv.appendChild(fieldDiv);
    });

    const txDiv = document.createElement('div');
    txDiv.className = 'event-tx';

    const txLabelDiv = document.createElement('div');
    txLabelDiv.className = 'event-tx-label';
    txLabelDiv.textContent = 'Hash da Transação:';

    const txHashDiv = document.createElement('div');
    txHashDiv.className = 'event-tx-hash';
    txHashDiv.textContent = transactionHash;

    txDiv.appendChild(txLabelDiv);
    txDiv.appendChild(txHashDiv);

    eventDiv.appendChild(headerDiv);
    eventDiv.appendChild(detailsDiv);
    eventDiv.appendChild(txDiv);

    return eventDiv;
  }

  function getEventFields(eventName, eventData) {
    switch (eventName) {
      case 'CompanyUpsert':
        return [
          { label: 'Empresa', value: shorten(eventData.empresa) },
          { label: 'CNPJ', value: eventData.cnpj },
          { label: 'Nome', value: eventData.name },
          { label: 'Ativo', value: eventData.active ? 'Sim' : 'Não' }
        ];

      case 'CompanyAreaSet':
        return [
          { label: 'Empresa', value: shorten(eventData.empresa) },
          { label: 'Área', value: b32ToLabel(eventData.area) },
          { label: 'Habilitada', value: eventData.allowed ? 'Sim' : 'Não' }
        ];

      case 'BudgetSet':
        return [
          { label: 'Ano', value: eventData.ano.toString() },
          { label: 'Área', value: b32ToLabel(eventData.area) },
          { label: 'Orçamento', value: eventData.cap.toString() }
        ];

      case 'MintToAgency':
        return [
          { label: 'Agência', value: shorten(eventData.to) },
          { label: 'Área', value: b32ToLabel(eventData.area) },
          { label: 'Ano', value: eventData.ano.toString() },
          { label: 'Valor', value: eventData.amount.toString() }
        ];

      case 'TransferAreaYear':
        return [
          { label: 'De', value: eventData.from === '0x0000000000000000000000000000000000000000' ? 'MINT' : shorten(eventData.from) },
          { label: 'Para', value: eventData.to === '0x0000000000000000000000000000000000000000' ? 'BURN' : shorten(eventData.to) },
          { label: 'Ano', value: eventData.ano.toString() },
          { label: 'Área', value: b32ToLabel(eventData.area) },
          { label: 'Valor', value: eventData.amount.toString() }
        ];

      case 'PaidCompany':
        return [
          { label: 'Agência', value: shorten(eventData.agency) },
          { label: 'Empresa', value: shorten(eventData.company) },
          { label: 'Ano', value: eventData.ano.toString() },
          { label: 'Área', value: b32ToLabel(eventData.area) },
          { label: 'Valor', value: eventData.amount.toString() }
        ];

      default:
        return [];
    }
  }

  function addEventToLog(eventElement) {
    if (eventElement) {
      eventsLog.insertBefore(eventElement, eventsLog.firstChild);
      // Keep only the last 100 events
      const events = eventsLog.querySelectorAll('.event-item');
      if (events.length > 100) {
        events[events.length - 1].remove();
      }
    }
  }

  function setupEventListeners() {
    // Remove existing listeners
    if (contract && contract.removeAllListeners) {
      contract.removeAllListeners();
    }

    // Setup new listeners for each event type
    const eventTypes = ['CompanyUpsert', 'CompanyAreaSet', 'BudgetSet', 'MintToAgency', 'TransferAreaYear', 'PaidCompany'];
    
    eventTypes.forEach(eventName => {
      contract.on(eventName, (...args) => {
        const event = args[args.length - 1]; // Last argument is the event object
        const eventData = {};
        
        // Extract event arguments based on event signature
        switch (eventName) {
          case 'CompanyUpsert':
            eventData.empresa = args[0];
            eventData.cnpj = args[1];
            eventData.name = args[2];
            eventData.active = args[3];
            break;
          case 'CompanyAreaSet':
            eventData.empresa = args[0];
            eventData.area = args[1];
            eventData.allowed = args[2];
            break;
          case 'BudgetSet':
            eventData.ano = args[0];
            eventData.area = args[1];
            eventData.cap = args[2];
            break;
          case 'MintToAgency':
            eventData.to = args[0];
            eventData.area = args[1];
            eventData.ano = args[2];
            eventData.amount = args[3];
            break;
          case 'TransferAreaYear':
            eventData.from = args[0];
            eventData.to = args[1];
            eventData.ano = args[2];
            eventData.area = args[3];
            eventData.amount = args[4];
            break;
          case 'PaidCompany':
            eventData.agency = args[0];
            eventData.company = args[1];
            eventData.ano = args[2];
            eventData.area = args[3];
            eventData.amount = args[4];
            break;
        }

        const eventElement = createEventElement(eventName, eventData, event.transactionHash);
        addEventToLog(eventElement);
      });
    });

    console.log('Event listeners configured for:', eventTypes.join(', '));
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

      // Get contract address from localStorage or prompt user
      let addr = localStorage.getItem('dinheiroCarimbadoAddress');
      if (!addr) {
        addr = prompt('Digite o endereço do contrato DinheiroCarimbado:');
        if (addr) {
          localStorage.setItem('dinheiroCarimbadoAddress', addr);
        }
      }

      if (!addr) {
        throw new Error('Endereço do contrato não fornecido');
      }

      contract = new ethers.Contract(addr, abi, provider);
      contractAddress.textContent = shorten(addr);

      // Get latest block number
      const blockNumber = await provider.getBlockNumber();
      lastBlock.textContent = blockNumber.toString();

      // Setup event listeners
      setupEventListeners();

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
