# Setup

1. Criar contas.
2. Permissionar contas na rede lab.
3. Preparar `.env`.
4. Subir túnel para writer do lab.
5. Fazer deploy: `npm run deploy:rbblab`
6. Obter o endereço do contrato e configurar no `.env`: *DinheiroCarimbado deployed to: 0x...*
7. Obter o endereço do token para configurar no Metamask: *Token (ERC20) address: 0x...*
8. Rodar verificação: `npm run verify:rbblab`
9. Rodar aplicação: `npm run web`
10. Abrir frontend em: http://127.0.0.1:8080


# Demonstração

## Legislador
1. Definir orçamento para saúde.
2. Definir orçamento para educação.

Observações:
- Não acompanhamos eventos / inspecionamos transações no block explorer.


## Tesouro
1. Alocar orçamento de saúde no respectivo ministério.
2. Alocar orçamento de educação no respectivo ministério.

Observações:
- Não há restrições onde alocar os recursos. Mas, no workshop, seguir os ministérios das respectivas áreas.
- Não acompanhamos eventos / inspecionamos transações no block explorer.


## Pagamentos
1. Efetuar um pagamento para saúde.
2. Efetuar um pagamento para educação.
3. Ativar *modo hacker* (Ctrl+Alt+Shift+H) e demonstrar recusa de transferência não permitida.

Observações:
- Não temos usado a opção *"Agência — Transferência entre Órgãos"* na demonstração.


## Transferência de tokens
1. Montar arquivo `data/cadastros_empresa.csv`.
2. Rodar carga: `npm run load-empresas:rbblab`
3. Rodar pagamento: `npm run paga-empresas:rbblab`

Observações:
- O script de pagamento utiliza o ano de 2025 para o orçamento! Caso não haja recursos nesse orçamento, nenhuma transferência ocorrerá.
