# 📡 Sistema de Monitoramento Blockchain - Dinheiro Carimbado

## 🎯 Visão Geral

Esta página simula um **Sistema de Auditoria e Compliance** externo que monitora em tempo real todos os eventos críticos do contrato inteligente Dinheiro Carimbado. É uma ferramenta profissional para supervisão e auditoria das operações blockchain.

## 🚀 Como Acessar

A página de monitoramento é **independente** do sistema principal e deve ser acessada diretamente:

```
http://localhost:8080/monitor.html
```

**⚠️ Importante**: Esta página não aparece no menu principal, simulando um sistema externo de auditoria.

## 🎨 Design Diferenciado

- **Tema Escuro Profissional**: Azul escuro com detalhes em azul claro
- **Layout de Sistema de Monitoramento**: Similar a sistemas de NOC/SOC
- **Cores por Tipo de Evento**: Cada evento tem uma cor específica para fácil identificação
- **Interface Responsiva**: Funciona em desktop e mobile

## 📊 Eventos Monitorados

### 🟣 Eventos de Empresa (Roxo)
- **CompanyUpsert**: Cadastro/atualização de empresas
- **CompanyAreaSet**: Habilitação de empresa para área específica

### 🟡 Eventos de Orçamento (Amarelo)
- **BudgetSet**: Definição de tetos orçamentários por ano/área

### 🟢 Eventos de Emissão (Verde)
- **MintToAgency**: Emissão de recursos carimbados para agências

### 🔵 Eventos de Transferência (Azul)
- **TransferAreaYear**: Transferências entre agências

### 🟣 Eventos de Pagamento (Rosa)
- **PaidCompany**: Pagamentos de agências para empresas

## 🔧 Funcionalidades

### ⚡ Monitoramento em Tempo Real
- Detecta eventos **imediatamente** após confirmação na blockchain
- Atualização automática do número do bloco a cada 15 segundos
- Sem necessidade de refresh manual

### 🎛️ Controles Avançados
- **Filtros por Tipo**: Ative/desative eventos específicos
- **Limpeza de Log**: Botão para limpar histórico
- **Status de Conexão**: Indicador visual online/offline

### 📋 Informações Detalhadas
Para cada evento capturado, são exibidos:
- **Timestamp preciso** da detecção
- **Todos os parâmetros** do evento
- **Hash da transação** para rastreabilidade
- **Formatação amigável** de endereços e dados

## 🎭 Uso no Workshop

### Cenário de Apresentação
1. **Manter a página aberta** em uma aba separada
2. **Executar operações** no sistema principal (pagamento.html, tesouro.html, etc.)
3. **Mostrar instantaneamente** como os eventos aparecem no sistema de auditoria
4. **Demonstrar transparência** total das operações blockchain

### Efeito Demonstrativo
- Mostra que **toda operação é rastreável**
- Simula **sistemas de compliance** reais
- Demonstra **imutabilidade** e **transparência** da blockchain
- Impressiona com **detecção instantânea** de eventos

## 🛠️ Configuração Técnica

### Primeira Conexão
1. Clique em "🔌 Conectar ao Blockchain"
2. Conecte o MetaMask
3. Informe o endereço do contrato DinheiroCarimbado
4. Aguarde confirmação da conexão

### Filtros de Eventos
- **Todos ativados por padrão**
- **Desmarque** eventos que não quer monitorar
- **Mudanças aplicadas instantaneamente**

### Performance
- **Mantém apenas os últimos 100 eventos** para performance
- **Scroll infinito** para navegação
- **Animações suaves** para novos eventos

## 🎨 Paleta de Cores

```css
Fundo Principal: #0a0e1a (Azul Muito Escuro)
Superfície: #1a1f2e (Azul Escuro)
Primária: #3b82f6 (Azul)
Eventos Empresa: #8b5cf6 (Roxo)
Eventos Orçamento: #f59e0b (Amarelo)
Eventos Emissão: #22c55e (Verde)
Eventos Transferência: #3b82f6 (Azul)
Eventos Pagamento: #ec4899 (Rosa)
```

## 🚀 Demonstração Ideal

1. **Abra o monitor** em tela cheia
2. **Execute uma operação** no sistema principal
3. **Observe em tempo real** o evento aparecer
4. **Explique os dados** mostrados no evento
5. **Destaque a transparência** total da operação

Este sistema demonstra perfeitamente como blockchains públicas oferecem **transparência total** e **auditabilidade instantânea** de todas as operações! 🔗✨
