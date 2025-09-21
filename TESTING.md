# Testes de Implantação do Contrato DinheiroCarimbado

Este projeto inclui um conjunto abrangente de testes para verificar se o contrato `DinheiroCarimbado` foi corretamente implantado e está funcionando como esperado.

## Tipos de Testes Disponíveis

### 1. Testes Básicos de Implantação
**Arquivo:** `test/simple-deployment.test.js`

Testes fundamentais que verificam:
- ✅ Deploy bem-sucedido do contrato
- ✅ Inicialização correta do estado
- ✅ Validação de endereços como o frontend faz
- ✅ Compatibilidade com ABI do frontend
- ✅ Gerenciamento de roles
- ✅ Gerenciamento de áreas
- ✅ Emissão de eventos
- ✅ Descoberta de áreas (como frontend)
- ✅ Tamanho do contrato

**Executar:**
```bash
npx hardhat test test/simple-deployment.test.js
```

### 2. Script de Verificação Interativo
**Arquivo:** `scripts/verify-deployment.js`

Script completo que faz verificação detalhada e interativa:
- 🔍 Verifica bytecode na rede
- 🔧 Testa funcionalidades básicas
- 🎯 Simula validação do frontend
- 📊 Mostra estatísticas de gas e tamanho
- 📋 Relatório completo

**Executar:**
```bash
# Deploy novo contrato e verificar
npm run verify:deployment

# Ou verificar contrato existente
npm run verify:contract 0xSeuEnderecoAqui
```

### 3. Utilitários Helper
**Arquivo:** `test/helpers/deploy.js`

Funções reutilizáveis para testes:
- `deployDinheiroCarimbado(owner)` - Deploy correto do contrato
- `getDCToken(dinheiroCarimbado)` - Obter instância do DCToken

## Como Executar

### Pré-requisitos
```bash
npm install
npm run compile
```

### Executar Todos os Testes
```bash
npm run test
```

### Executar Testes Específicos
```bash
# Apenas testes de implantação
npm run test:deployment

# Apenas testes do frontend
npm run test:frontend

# Teste simples e confiável
npx hardhat test test/simple-deployment.test.js
```

### Verificação de Deploy
```bash
# Verificar com novo deploy
npm run verify:deployment

# Verificar contrato existente
npm run verify:contract 0xSeuContrato
```

## Validações Realizadas

### 1. Validação de Endereço (como frontend)
- ✅ Formato válido de endereço Ethereum
- ✅ Presença de bytecode no endereço
- ✅ Diferenciação entre EOA e contrato

### 2. Compatibilidade com Frontend
Testa a mesma ABI mínima usada no `frontend/app.js`:
- `isLegislator(address)`
- `isArea(bytes32)`
- `budget(uint16, bytes32)`
- `totalSupplyArea(bytes32)`
- `setBudget(uint16, bytes32, uint256)`

### 3. Descoberta de Áreas
Simula exatamente como o frontend descobre áreas:
- Parse de eventos `AreaAdded` e `AreaRemoved`
- Filtragem de áreas ativas
- Compatibilidade com logs da blockchain

### 4. Estado Inicial
- ✅ Owner corretamente definido
- ✅ DCToken implantado e vinculado
- ✅ Roles inicialmente vazios
- ✅ Token scale correto (1e18)

### 5. Funcionalidades Básicas
- ✅ Gerenciamento de roles (apenas owner)
- ✅ Adição/remoção de áreas
- ✅ Definição de orçamentos (apenas legisladores)
- ✅ Emissão correta de eventos

## Integração com Frontend

Para usar um contrato implantado no frontend:

### 1. Inicie a rede local
```bash
npm run node
```

### 2. Faça deploy do contrato
```bash
npm run deploy:local
```

### 3. Copie o endereço do contrato
O endereço será exibido no terminal.

### 4. Verifique o contrato
```bash
npm run verify:contract 0xSeuEndereco
```

### 5. Use no frontend
Abra `frontend/app.js` e cole o endereço no input ou salve no localStorage.

### 6. Inicie o frontend
```bash
npm run web
```

## Troubleshooting

### Erro: "incorrect number of arguments to constructor"
O contrato `DinheiroCarimbado` precisa de um parâmetro `_owner` no construtor.
**Solução:** Use `deployDinheiroCarimbado(owner)` do helper.

### Erro: "Nenhum contrato encontrado nesse endereço"
O endereço não tem bytecode (é um EOA ou endereço vazio).
**Solução:** Verifique se fez deploy corretamente e está na rede certa.

### Erro: "Contrato incompatível com a ABI esperada"
O contrato no endereço não tem os métodos esperados.
**Solução:** Verifique se o contrato é o DinheiroCarimbado correto.

### Testes falhando com chai
Certifique-se de ter as dependências corretas:
```bash
npm install --save-dev chai@4.2.0 @nomicfoundation/hardhat-chai-matchers
```

## Estrutura dos Arquivos de Teste

```
test/
├── helpers/
│   └── deploy.js              # Utilitários de deploy
├── simple-deployment.test.js  # Testes básicos confiáveis
├── deployment.test.js         # Testes completos (em desenvolvimento)
├── frontend-validation.test.js # Validação específica do frontend
└── integration.test.js        # Testes de integração completos

scripts/
└── verify-deployment.js       # Script de verificação interativo
```

## Scripts Disponíveis

- `npm run test` - Todos os testes
- `npm run test:deployment` - Testes de implantação
- `npm run test:frontend` - Validação frontend
- `npm run verify:deployment` - Verificação completa
- `npm run verify:contract <endereço>` - Verificar contrato específico
- `npm run compile` - Compilar contratos
- `npm run deploy:local` - Deploy na rede local
- `npm run node` - Iniciar rede Hardhat
- `npm run web` - Iniciar frontend

## Boas Práticas

1. **Sempre compile antes de testar:**
   ```bash
   npm run compile
   ```

2. **Use o teste simples para verificação rápida:**
   ```bash
   npx hardhat test test/simple-deployment.test.js
   ```

3. **Verifique contratos após deploy:**
   ```bash
   npm run verify:contract 0xSeuEndereco
   ```

4. **Para desenvolvimento, use o script interativo:**
   ```bash
   npm run verify:deployment
   ```

Este conjunto de testes garante que o contrato `DinheiroCarimbado` está:
- ✅ Corretamente implantado
- ✅ Funcionando como esperado
- ✅ Compatível com o frontend
- ✅ Emitindo eventos corretos
- ✅ Respeitando regras de acesso
- ✅ Dentro dos limites de gas e tamanho
