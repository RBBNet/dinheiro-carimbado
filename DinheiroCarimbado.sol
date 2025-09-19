// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Dinheiro Carimbado (MVP didático para workshop)
/// @notice Saldos por área, com tetos orçamentários anuais e regras mínimas:
///         Tesouraria emite para Órgãos; Órgãos pagam Empresas habilitadas por área;
///         Empresas não transferem; Liquidante liquida/queima com ref. off-chain.
contract DinheiroCarimbado {
    // --------- Administração / Papéis ---------
    address public owner;
    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }

    mapping(address => bool) public isLegislator;
    mapping(address => bool) public isTreasury;
    mapping(address => bool) public isAgency;
    mapping(address => bool) public isLiquidator;

    event RoleSet(string role, address indexed who, bool enabled);

    function setLegislator(address a, bool e) external onlyOwner { isLegislator[a] = e; emit RoleSet("LEGISLATOR", a, e); }
    function setTreasury(address a, bool e)   external onlyOwner { isTreasury[a]   = e; emit RoleSet("TREASURY", a, e); }
    function setAgency(address a, bool e)     external onlyOwner { isAgency[a]     = e; emit RoleSet("AGENCY", a, e); }
    function setLiquidator(address a, bool e) external onlyOwner { isLiquidator[a] = e; emit RoleSet("LIQUIDATOR", a, e); }

    // --------- Áreas ---------
    mapping(bytes32 => bool) public isArea;
    event AreaAdded(bytes32 indexed area);
    event AreaRemoved(bytes32 indexed area);

    function addArea(bytes32 area) external onlyOwner {
        require(area != bytes32(0), "invalid area");
        require(!isArea[area], "exists");
        isArea[area] = true;
        emit AreaAdded(area);
    }

    function removeArea(bytes32 area) external onlyOwner {
        require(isArea[area], "not exists");
        isArea[area] = false;
        emit AreaRemoved(area);
    }

    // --------- Cadastros de Orgaos e Empresas ---------
    struct Company {
        bytes14 cnpj;      // 14 dígitos sem formatação; validação forte fica off-chain
        bool active;
        mapping(bytes32 => bool) allowedArea; // empresa habilitada por area
    }

    mapping(address => Company) private companies;
    mapping(address => bool) public isCompany; // ajuda consultas

    event CompanyUpsert(address indexed empresa, bytes14 cnpj, bool active);
    event CompanyAreaSet(address indexed empresa, bytes32 indexed area, bool allowed);

    function upsertCompany(address empresa, bytes14 cnpj, bool active) external onlyOwner {
        isCompany[empresa] = true;
        companies[empresa].cnpj = cnpj;
        companies[empresa].active = active;
        emit CompanyUpsert(empresa, cnpj, active);
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

    // --------- Orçamento (teto por ano/area) ---------
    // anoFiscal => area => {teto, emitido}
    struct Budget { uint256 cap; uint256 minted; }
    mapping(uint16 => mapping(bytes32 => Budget)) public budget;

    event BudgetSet(uint16 indexed ano, bytes32 indexed area, uint256 cap);

    function setBudget(uint16 ano, bytes32 area, uint256 cap) external {
        require(isLegislator[msg.sender], "not legislator");
        require(isArea[area], "invalid area");
        budget[ano][area].cap = cap;
        emit BudgetSet(ano, area, cap);
    }

    function remaining(uint16 ano, bytes32 area) external view returns (uint256) {
        Budget memory b = budget[ano][area];
        if (b.minted >= b.cap) return 0;
        return b.cap - b.minted;
    }

    // --------- Saldos por Área ---------
    // saldo[conta][area]
    mapping(address => mapping(bytes32 => uint256)) public balanceOfArea;
    mapping(bytes32 => uint256) public totalSupplyArea;

    event MintToAgency(address indexed to, bytes32 indexed area, uint16 indexed ano, uint256 amount);
    event TransferArea(address indexed from, address indexed to, bytes32 indexed area, uint256 amount);
    event PaidCompany(address indexed agency, address indexed company, bytes32 indexed area, uint256 amount);
    event Settled(address indexed company, bytes32 indexed area, uint256 amount, bytes32 offchainRef);

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
        balanceOfArea[orgao][area] += amount;
        totalSupplyArea[area] += amount;

        emit MintToAgency(orgao, area, ano, amount);
        emit TransferArea(address(0), orgao, area, amount);
    }

    /// @notice Órgão transfere recurso carimbado a outro Órgão (mesma área)
    function transferAgencyToAgency(address para, bytes32 area, uint256 amount) external {
        require(isAgency[msg.sender], "from not agency");
        require(isAgency[para], "to not agency");
        require(isArea[area], "invalid area");
        _move(msg.sender, para, area, amount);
    }

    /// @notice Órgão paga Empresa habilitada na área
    function payCompany(address empresa, bytes32 area, uint256 amount) external {
        require(isAgency[msg.sender], "from not agency");
        require(isCompanyAllowedForArea(empresa, area), "company/area not allowed");
        _move(msg.sender, empresa, area, amount);
        emit PaidCompany(msg.sender, empresa, area, amount);
    }

    /// @notice Liquida/queima saldo da empresa com referência off-chain (ex.: hash de NF)
    function settle(address empresa, bytes32 area, uint256 amount, bytes32 offchainRef) external {
        require(isLiquidator[msg.sender], "not liquidator");
        require(isCompany[empresa], "not company");
        require(isArea[area], "invalid area");
        require(amount > 0, "zero");
        uint256 bal = balanceOfArea[empresa][area];
        require(bal >= amount, "insufficient");

        balanceOfArea[empresa][area] = bal - amount;
        totalSupplyArea[area] -= amount;

        emit Settled(empresa, area, amount, offchainRef);
        emit TransferArea(empresa, address(0), area, amount);
    }

    // --------- Regras de bloqueio para Empresas ---------
    // Empresas NÃO transferem. Se quiser estorno/retorno, faça função específica no MVP (omita para simplificar).

    // --------- Internals ---------
    function _move(address de, address para, bytes32 area, uint256 amount) internal {
        require(amount > 0, "zero");
        uint256 bal = balanceOfArea[de][area];
        require(bal >= amount, "insufficient");
        balanceOfArea[de][area] = bal - amount;
        balanceOfArea[para][area] += amount;
        emit TransferArea(de, para, area, amount);
    }

    // --------- Construtor ---------
    constructor(address _owner) {
        require(_owner != address(0), "zero owner");
        owner = _owner;
    }

    // --------- Utilidade ---------
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero");
        owner = newOwner;
    }
}
