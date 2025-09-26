// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "./DCToken.sol";

/// @title Dinheiro Carimbado (MVP didático para workshop)
/// @notice Saldos por área, com tetos orçamentários anuais e regras mínimas:
///         Tesouraria emite para Órgãos; Órgãos pagam Empresas habilitadas por área;
///         Empresas não transferem; Liquidante liquida/queima com ref. off-chain.
contract DinheiroCarimbado {
    // ERC20 para demonstração (mint ao pagar empresa)
    DCToken public token;
    uint256 public constant tokenScale = 1e18; // 1 unidade interna = 1e18 tokens
    // --------- Administração / Papéis ---------
    address public owner;
    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }

    mapping(address => bool) public isLegislator;
    mapping(address => bool) public isTreasury;
    mapping(address => bool) public isAgency;
    mapping(address => bool) public isLiquidator;
    
    // Agency names mapping
    mapping(address => string) public agencyNames;

    event RoleSet(string role, address indexed who, bool enabled);
    event AgencyNameSet(address indexed agency, string name);

    function setLegislator(address a, bool e) external onlyOwner { isLegislator[a] = e; emit RoleSet("LEGISLATOR", a, e); }
    function setTreasury(address a, bool e)   external onlyOwner { isTreasury[a]   = e; emit RoleSet("TREASURY", a, e); }
    function setAgency(address a, bool e, string calldata name) external onlyOwner { 
        isAgency[a] = e; 
        if (e) {
            agencyNames[a] = name;
            emit AgencyNameSet(a, name);
        }
        emit RoleSet("AGENCY", a, e); 
    }
    function setLiquidator(address a, bool e) external onlyOwner { isLiquidator[a] = e; emit RoleSet("LIQUIDATOR", a, e); }

    // --------- Áreas ---------
    mapping(bytes32 => bool) public isArea;
    bytes32[] private areaRegistry;
    mapping(bytes32 => bool) private areaSeen;
    event AreaAdded(bytes32 indexed area);
    event AreaRemoved(bytes32 indexed area);

    function addArea(bytes32 area) external onlyOwner {
        require(area != bytes32(0), "invalid area");
        require(!isArea[area], "exists");
        isArea[area] = true;
        if (!areaSeen[area]) {
            areaSeen[area] = true;
            areaRegistry.push(area);
        }
        emit AreaAdded(area);
    }

    function removeArea(bytes32 area) external onlyOwner {
        require(isArea[area], "not exists");
        isArea[area] = false;
        emit AreaRemoved(area);
    }

    function getAreas() external view returns (bytes32[] memory activeAreas) {
        uint256 count = 0;
        uint256 len = areaRegistry.length;
        for (uint256 i = 0; i < len; i++) {
            if (isArea[areaRegistry[i]]) {
                count++;
            }
        }

        activeAreas = new bytes32[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < len; i++) {
            bytes32 area = areaRegistry[i];
            if (isArea[area]) {
                activeAreas[index] = area;
                index++;
            }
        }
    }

    // --------- Cadastros de Orgaos e Empresas ---------
    struct Company {
        bytes14 cnpj;      // 14 dígitos sem formatação; validação forte fica off-chain
        string name;       // nome da empresa
        bool active;
        mapping(bytes32 => bool) allowedArea; // empresa habilitada por area
    }

    mapping(address => Company) private companies;
    mapping(address => bool) public isCompany; // ajuda consultas

    event CompanyUpsert(address indexed empresa, bytes14 cnpj, string name, bool active);
    event CompanyAreaSet(address indexed empresa, bytes32 indexed area, bool allowed);

    function upsertCompany(address empresa, bytes14 cnpj, string calldata name, bool active) external onlyOwner {
        isCompany[empresa] = true;
        companies[empresa].cnpj = cnpj;
        companies[empresa].name = name;
        companies[empresa].active = active;
        emit CompanyUpsert(empresa, cnpj, name, active);
    }

    function setCompanyArea(address empresa, bytes32 area, bool allowed) external onlyOwner {
        require(isCompany[empresa], "not company");
        require(isArea[area], "invalid area");
        companies[empresa].allowedArea[area] = allowed;
        emit CompanyAreaSet(empresa, area, allowed);
    }

    function isCompanyAllowedForArea(address empresa, bytes32 area) public view returns (bool) {
        return isCompany[empresa] && companies[empresa].active && companies[empresa].allowedArea[area];
    }

    function getCompanyName(address empresa) external view returns (string memory) {
        require(isCompany[empresa], "not company");
        return companies[empresa].name;
    }

    // --------- Helper functions for year-based balances ---------
    /// @notice Get total balance for an address across all years for a specific area
    function getTotalBalanceByArea(address /*account*/, bytes32 /*area*/) external pure returns (uint256 total) {
        // This would require iterating through years - implement as needed
        // For now, return 0 as this is mainly for compatibility
        return 0;
    }

    /// @notice Get balance for specific area and year
    function getBalanceByAreaYear(address account, bytes32 area, uint16 year) external view returns (uint256) {
        return balanceOfAreaYear[account][area][year];
    }

    // --------- Orçamento (teto por ano/area) ---------
    // anoFiscal => area => {teto, emitido}
    struct Budget { uint256 cap; uint256 minted; }
    mapping(uint16 => mapping(bytes32 => Budget)) public budget;
    uint16[] private budgetYears;
    mapping(uint16 => bool) private budgetYearSeen;
    mapping(uint16 => bytes32[]) private budgetAreasByYear;
    mapping(uint16 => mapping(bytes32 => bool)) private budgetAreaSeen;

    struct BudgetView {
        uint16 ano;
        bytes32 area;
        uint256 cap;
        uint256 minted;
        uint256 realized;
    }

    event BudgetSet(uint16 indexed ano, bytes32 indexed area, uint256 cap);

    function setBudget(uint16 ano, bytes32 area, uint256 cap) external {
        require(isLegislator[msg.sender], "not legislator");
        require(isArea[area], "invalid area");
        budget[ano][area].cap = cap;
        if (!budgetYearSeen[ano]) {
            budgetYearSeen[ano] = true;
            budgetYears.push(ano);
        }
        if (!budgetAreaSeen[ano][area]) {
            budgetAreaSeen[ano][area] = true;
            budgetAreasByYear[ano].push(area);
        }
        emit BudgetSet(ano, area, cap);
    }

    function remaining(uint16 ano, bytes32 area) external view returns (uint256) {
        Budget memory b = budget[ano][area];
        if (b.minted >= b.cap) return 0;
        return b.cap - b.minted;
    }

    function getBudgetYears() external view returns (uint16[] memory) {
        return budgetYears;
    }

    function getBudgetsForYear(uint16 ano)
        external
        view
        returns (
            bytes32[] memory areas,
            uint256[] memory caps,
            uint256[] memory mintedValues,
            uint256[] memory realizedValues
        )
    {
        bytes32[] storage storedAreas = budgetAreasByYear[ano];
        uint256 len = storedAreas.length;
        areas = new bytes32[](len);
        caps = new uint256[](len);
        mintedValues = new uint256[](len);
        realizedValues = new uint256[](len);

        for (uint256 i = 0; i < len; i++) {
            bytes32 area = storedAreas[i];
            Budget storage b = budget[ano][area];
            areas[i] = area;
            caps[i] = b.cap;
            mintedValues[i] = b.minted;
            realizedValues[i] = totalMintedAreaYear[area][ano];
        }
    }

    function getAllBudgets() external view returns (BudgetView[] memory entries) {
        uint256 total = 0;
        uint256 yearsLen = budgetYears.length;
        for (uint256 i = 0; i < yearsLen; i++) {
            total += budgetAreasByYear[budgetYears[i]].length;
        }

        entries = new BudgetView[](total);
        uint256 index = 0;
        for (uint256 i = 0; i < yearsLen; i++) {
            uint16 ano = budgetYears[i];
            bytes32[] storage areasForYear = budgetAreasByYear[ano];
            uint256 len = areasForYear.length;
            for (uint256 j = 0; j < len; j++) {
                bytes32 area = areasForYear[j];
                Budget storage b = budget[ano][area];
                entries[index] = BudgetView({
                    ano: ano,
                    area: area,
                    cap: b.cap,
                    minted: b.minted,
                    realized: totalMintedAreaYear[area][ano]
                });
                index++;
            }
        }
    }

    // --------- Saldos por Área e Ano ---------
    // saldo[conta][area][ano]
    mapping(address => mapping(bytes32 => mapping(uint16 => uint256))) public balanceOfAreaYear;
    mapping(bytes32 => mapping(uint16 => uint256)) public totalSupplyAreaYear;
    mapping(bytes32 => mapping(uint16 => uint256)) public totalMintedAreaYear; // Total de tokens DCT mintados

    event MintToAgency(address indexed to, bytes32 indexed area, uint16 indexed ano, uint256 amount);
    event TransferAreaYear(address indexed from, address indexed to, uint16 indexed ano, bytes32 area, uint256 amount);
    event PaidCompany(address indexed agency, address indexed company, uint16 indexed ano, bytes32 area, uint256 amount);
    event Settled(address indexed company, bytes32 indexed area, uint16 indexed ano, uint256 amount, bytes32 offchainRef);

    // --------- Emissão e Movimentações ---------

    /// @notice Tesouraria emite recurso carimbado para um Órgão respeitando o teto do ano/área
    function mintToAgency(address orgao, bytes32 area, uint16 ano, uint256 amount) external {
        require(isTreasury[msg.sender], "not treasury");
        require(isAgency[orgao], "to not agency");
        require(isArea[area], "invalid area");
        require(amount > 0, "zero");

        Budget storage b = budget[ano][area];
        require(b.cap > 0, "cap not set");
        require(b.minted + amount <= b.cap, "cap exceeded");

        b.minted += amount;
        balanceOfAreaYear[orgao][area][ano] += amount;
        totalSupplyAreaYear[area][ano] += amount;

        emit MintToAgency(orgao, area, ano, amount);
        emit TransferAreaYear(address(0), orgao, ano, area, amount);
    }

    /// @notice Órgão transfere recurso carimbado a outro Órgão (mesma área e ano)
    function transferAgencyToAgency(address para, bytes32 area, uint16 ano, uint256 amount) external {
        require(isAgency[msg.sender], "from not agency");
        require(isAgency[para], "to not agency");
        require(isArea[area], "invalid area");
        _moveByYear(msg.sender, para, area, ano, amount);
    }

    /// @notice Órgão paga Empresa habilitada na área; também minte ERC20 para a empresa (para visualização em carteira)
    function payCompany(address empresa, bytes32 area, uint16 ano, uint256 amount) external {
        require(isAgency[msg.sender], "from not agency");
        require(isCompanyAllowedForArea(empresa, area), "company/area not allowed");
        _moveByYear(msg.sender, empresa, area, ano, amount);
        emit PaidCompany(msg.sender, empresa, ano, area, amount);
        // Mint do token ERC20 para a empresa (1:1 com escala de 18 casas decimais)
        token.mint(empresa, amount * tokenScale);
        // Registrar total de tokens mintados para este ano/área
        totalMintedAreaYear[area][ano] += amount;
    }

    /// @notice Liquida/queima saldo da empresa com referência off-chain (ex.: hash de NF)
    function settle(address empresa, bytes32 area, uint16 ano, uint256 amount, bytes32 offchainRef) external {
        require(isLiquidator[msg.sender], "not liquidator");
        require(isCompany[empresa], "not company");
        require(isArea[area], "invalid area");
        require(amount > 0, "zero");
        uint256 bal = balanceOfAreaYear[empresa][area][ano];
        require(bal >= amount, "insufficient");

        balanceOfAreaYear[empresa][area][ano] = bal - amount;
        totalSupplyAreaYear[area][ano] -= amount;

        emit Settled(empresa, area, ano, amount, offchainRef);
        emit TransferAreaYear(empresa, address(0), ano, area, amount);
    }

    // --------- Regras de bloqueio para Empresas ---------
    // Empresas NÃO transferem. Se quiser estorno/retorno, faça função específica no MVP (omita para simplificar).

    // --------- Internals ---------
    function _moveByYear(address de, address para, bytes32 area, uint16 ano, uint256 amount) internal {
        require(amount > 0, "zero");
        uint256 bal = balanceOfAreaYear[de][area][ano];
        require(bal >= amount, "insufficient");
        balanceOfAreaYear[de][area][ano] = bal - amount;
        balanceOfAreaYear[para][area][ano] += amount;
        emit TransferAreaYear(de, para, ano, area, amount);
    }

    // --------- Construtor ---------
    constructor(address _owner) {
        require(_owner != address(0), "zero owner");
        owner = _owner;
        // Cria o token ERC20 com o próprio contrato como minter
        token = new DCToken("Dinheiro Carimbado Token", "DCT", address(this));
    }

    // --------- Utilidade ---------
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero");
        owner = newOwner;
    }
}
