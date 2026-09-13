# Visão geral da arquitetura

> Este documento é um **mapa geral resumido**, pra situar rápido o que é cada
> arquivo e como as peças se conectam. O detalhe de cada função/bloco de tela
> está em comentário dentro do próprio código (nos arquivos `js/*.js` e no
> `index.html`) — é lá que fica a fonte de verdade, pra não ter dois lugares
> pra manter sincronizados. Para instalação, deploy e customização por
> cliente, veja [README.md](../README.md) e [DEPLOY.md](../DEPLOY.md).

## O que é o app

Um PWA (site que funciona como aplicativo) para o dono de uma distribuidora
de água/gás transformar pedidos recebidos por WhatsApp em uma lista
organizada e em recibos impressos numa impressora térmica Bluetooth. Roda
inteiro no navegador/celular — sem servidor, sem internet depois de aberto
uma vez, com os dados guardados no próprio aparelho (IndexedDB).

## Os arquivos, em uma linha cada

| Arquivo | Responsabilidade |
|---|---|
| `index.html` | A tela toda do app (as 3 abas, formulários, modais) — um único arquivo, sem outras páginas. |
| `config.js` | Ajustes do negócio (nome, título do recibo, feature flags) — o único arquivo pensado pra mudar por cliente. |
| `service-worker.js` | Faz o app funcionar offline/instalável, guardando os arquivos em cache no celular. |
| `js/db.js` | Acesso ao IndexedDB (o banco de dados dentro do navegador). |
| `js/customers.js` | Cadastro de clientes, usado no autocomplete de telefone/endereço. |
| `js/products.js` | Catálogo de produtos (CRUD da aba Produtos). |
| `js/orders.js` | Criar/editar/excluir pedidos, calcular total, e decidir o que vai pro Histórico. |
| `js/auditLog.js` | Grava e lista as entradas do Histórico (log de auditoria). |
| `js/printer.js` | Monta o texto do recibo (pedido ou fechamento de caixa) e envia pra impressora via Bluetooth. |
| `js/app.js` | Liga tudo isso à tela: é o componente Alpine.js com o estado e as ações que o `index.html` usa. |

## Onde os dados ficam guardados

Tudo fica no IndexedDB (banco de dados dentro do navegador/celular, não sai
dali). Existem 4 "gavetas" (stores):

- **customers** — clientes já cadastrados (telefone + endereço), usados só pra sugerir no autocomplete.
- **products** — o catálogo de produtos vendáveis.
- **orders** — os pedidos em si (itens, valor, status, forma de pagamento).
- **auditLog** — o Histórico: uma entrada por alteração não-rotineira feita em um pedido.

## O ciclo de um pedido

1. **Criar**: monta o carrinho, escolhe pagamento, grava. Status inicial: `pendente`. Isso nunca aparece no Histórico — só é registrado o que muda *depois*.
2. **Imprimir**: seleciona pedido(s) pendente(s) e imprime; ao imprimir com sucesso, o status vira `impresso`.
3. **Entregar**: marca como `entregue`. Essas duas transições (`pendente → impresso → entregue`) são consideradas rotina do dia a dia e **não** entram no Histórico.
4. **Fora da rotina**: editar um pedido, cancelar, reverter o status, ou excluir — qualquer uma dessas ações grava uma entrada no Histórico com uma "foto" de antes e depois, pra servir de auditoria (ex.: conferir se alguém mexeu em um pedido sem motivo).
5. **Fechamento de caixa**: na aba Histórico, o botão de impressora imprime um resumo do dia (totais por forma de pagamento, itens entregues) — separado do recibo de cada pedido.

## Lembrete de deploy

Toda vez que qualquer arquivo do app mudar, é preciso aumentar, para o
**mesmo número**, tanto `CACHE_NAME` (em `service-worker.js`) quanto o
`?v=N` do `<script>` que registra o service worker (em `index.html`). Se só
um dos dois for atualizado, o celular do usuário pode continuar mostrando a
versão antiga do app mesmo com internet. Detalhes completos em
[README.md](../README.md#atualização-após-deploy).
