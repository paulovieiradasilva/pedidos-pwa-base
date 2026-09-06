# Pedidos PWA

Uma aplicação web progressiva (PWA) que permite ao proprietário de uma distribuidora de água e gás transformar pedidos recebidos via WhatsApp em comprovantes impressos via impressora térmica Bluetooth e em uma lista diária organizada, sem duplicar manualmente o trabalho. A aplicação funciona completamente offline, com dados salvos no IndexedDB do navegador e impressão direta via Web Bluetooth API.

Um pedido pode ter vários produtos diferentes (água, gás, ração etc, cada um com preço por forma de pagamento ou por peso), passa por um ciclo de status (pendente → impresso → entregue, ou cancelado) e pode ser editado ou cancelado depois de gravado. O app é pensado para ser vendido a outros distribuidores: cada cliente recebe sua própria cópia publicada, customizável sem afetar os demais — veja [DEPLOY.md](DEPLOY.md).

## Configuração e Desenvolvimento Local

### Instalação de dependências

```bash
npm install
```

### Executar testes

```bash
npm test
```

Os testes cobrem a lógica pura dos módulos de banco de dados, clientes, produtos, pedidos e impressão, usando `vitest` com `fake-indexeddb` para simular o IndexedDB em ambiente de teste.

## Visualização Local

Para servir a aplicação localmente (por exemplo, para testes em desenvolvimento):

```bash
npx http-server -p 8080
```

Acesse `http://localhost:8080` no navegador. Para testar Web Bluetooth, é necessário acessar via HTTPS ou `localhost` — se usar um IP local (por exemplo, `192.168.x.x:8080`), configure um contexto seguro com `localhost` ou use `npx localtunnel --port 8080` para tunelar via HTTPS.

## Atualização após Deploy

Após publicar a aplicação em produção (GitHub Pages ou qualquer servidor web):

1. **Faça commit das alterações:**
   ```bash
   git add .
   git commit -m "descrição das mudanças"
   ```

2. **Envie para o repositório:**
   ```bash
   git push
   ```

3. **IMPORTANTE — incremente 2 números antes de todo deploy:**
   - `CACHE_NAME` no topo de `service-worker.js` (ex.: `'pedidos-cache-v4'` → `'pedidos-cache-v5'`). O service worker usa cache-first e só percebe arquivos novos quando o nome do cache muda.
   - `?v=N` na chamada `navigator.serviceWorker.register("./service-worker.js?v=N")`, no `<script>` no fim de `index.html` (ex.: `?v=4` → `?v=5`). **Esse é o passo que mais importa em hosts sem controle de cache HTTP (GitHub Pages não deixa customizar isso, ao contrário do Netlify)**: o GitHub Pages sempre serve `service-worker.js` com `cache-control: max-age=600`, e em alguns navegadores/Android isso faz o `registration.update()` reaproveitar uma cópia em cache do arquivo mesmo quando ele mudou, achando que nada é diferente. Mudar a URL (`?v=N`) força buscar um arquivo "novo" que o navegador nunca viu, contornando esse cache por completo.

   Se esquecer qualquer um dos dois, o app **pode continuar rodando a versão antiga indefinidamente**, mesmo com internet e mesmo com o mecanismo de auto-atualização.

4. **Reabra a aplicação no celular com internet:**
   Como o novo `CACHE_NAME`/`?v=N` força a reinstalação do service worker, ele assume o controle assim que reabre o app (`skipWaiting`/`clients.claim`) e a página recarrega sozinha com os arquivos atualizados. Não precisa reinstalar o app — só abrir de novo com internet.

## Configurando a impressora

Os valores de `SERVICE_UUID` e `CHARACTERISTIC_UUID` no topo de `js/printer.js` são placeholders genéricos e **precisam ser substituídos** pelos valores reais da impressora térmica usada, obtidos via o spike de hardware:

1. Sirva/abra `spike/bluetooth-test.html` em um contexto seguro (HTTPS ou `localhost` — veja "Visualização Local" acima) no navegador do tablet Android.
2. Clique em "Conectar impressora" e selecione a impressora física na caixa de pareamento do Chrome.
3. O log da página listará os serviços e características BLE da impressora. Anote o **service UUID** e o **characteristic UUID** que aparecem com a propriedade `write` ou `writeWithoutResponse` igual a `true` — é essa característica que aceita os bytes ESC/POS.
4. Cole esses dois valores nas constantes `SERVICE_UUID` e `CHARACTERISTIC_UUID` no topo de `js/printer.js`, substituindo os placeholders.

Além disso, em `js/printer.js`:
- `CHUNK_SIZE` (atualmente 180 bytes) pode precisar ser reduzido para algo próximo de 20 bytes se a impressora não negociar um MTU de Bluetooth maior — chunks grandes demais para o MTU acordado são silenciosamente truncados ou descartados pela pilha Bluetooth.
- Se dados forem perdidos ou o recibo sair incompleto/corrompido mesmo com o `CHUNK_SIZE` reduzido, adicione um pequeno delay (`await new Promise(r => setTimeout(r, ...))`) entre o envio de cada chunk em `printReceipt` — algumas impressoras BLE clone não processam a fila de escrita rápido o suficiente.

## Requisitos do Web Bluetooth

- **Navegador:** Chrome ou navegadores baseados em Chromium (não funciona em Safari iOS).
- **Dispositivo:** Android com suporte a Bluetooth.
- **Contexto seguro:** A aplicação deve ser servida via HTTPS em produção ou `localhost` em desenvolvimento. Web Bluetooth não funciona em contextos inseguros (HTTP em IP local).
- **Impressora:** Uma impressora térmica 58mm com suporte a Bluetooth (BLE GATT), compatível com o protocolo ESC/POS.

## Estrutura do Projeto

```
.
├── index.html              # Arquivo principal da aplicação PWA
├── manifest.json           # Manifest do PWA (ícone, nome, tema) — customizado por cliente
├── config.js               # Configuração por cliente (nome do negócio, feature flags)
├── service-worker.js       # Service worker para cache offline
├── icon-192.png           # Ícone da aplicação (192x192px)
├── DEPLOY.md               # Como publicar e distribuir uma cópia por cliente
│
├── js/                     # Módulos JavaScript (ES modules)
│   ├── app.js             # Componente Alpine.js principal wiring da UI
│   ├── db.js              # Wrapper do IndexedDB (open/get/put/getAll)
│   ├── customers.js       # Busca/salva cliente por telefone, lista pra autocomplete
│   ├── products.js        # Catálogo de produtos (preço fixo ou por peso) com seed padrão
│   ├── orders.js          # Criação/edição de pedidos, cálculo de total e troco, status
│   └── printer.js         # Construção de recibo ESC/POS e envio via Bluetooth
│
├── vendor/                 # Dependências front-end localmente hospedadas
│   ├── tailwind.js        # Tailwind CSS CDN
│   └── alpine.min.js      # Alpine.js minificado
│
├── tests/                 # Testes automatizados (Vitest)
│   ├── setup.js           # Setup de testes (carrega fake-indexeddb)
│   ├── db.test.js
│   ├── customers.test.js
│   ├── products.test.js
│   ├── orders.test.js
│   └── printer.test.js
│
├── spike/                 # Prototipagem (validação de hardware)
│   └── bluetooth-test.html # Spike para testar conectividade Bluetooth BLE
│
├── package.json           # Dependências e scripts Node.js
├── vitest.config.js       # Configuração do Vitest
└── .gitignore            # Arquivos ignorados pelo Git
```

### Telas (menu)

O app tem 2 telas, alternadas por um menu fixo no topo (sem router, é tudo `x-if` do Alpine dentro do mesmo `index.html`):

- **Produtos:** CRUD de produtos — nome, marca (opcional) e preço, que pode ser os 3 valores por forma de pagamento (dinheiro/pix/cartão, com sincronização automática entre eles ao digitar) ou um preço único por kg pra produtos "vendidos por peso" (ex: ração). "Excluir" é sempre inativar (soft delete), nunca apagar de vez, pra não quebrar pedidos antigos que já usaram aquele produto. Produto inativo some do formulário de novo pedido mas continua na lista de Produtos (esmaecido, com botão pra reativar).
- **Pedidos:** lista do dia, com filtro de data, abas de status (Pendente/Impresso/Entregue/Cancelado) e filtro por forma de pagamento. O botão "+ Novo pedido" abre um formulário (telefone com autocomplete de cliente já cadastrado, endereço, carrinho com vários produtos diferentes no mesmo pedido, pagamento, troco) que substitui a lista enquanto está aberto. Cada pedido na aba Pendente/Impresso pode ser editado (reabre o mesmo formulário preenchido) ou cancelado; editar um pedido já impresso volta ele pra Pendente. Pedidos pendentes podem ser selecionados e impressos em lote (mesma conexão Bluetooth), o que move cada um pra "Impresso"; de lá, "Marcar entregue" fecha o ciclo.

### Fluxo de Dados

1. **Entrada:** O proprietário digita o telefone (sugestões de clientes já cadastrados aparecem a partir de 3 dígitos), endereço (se novo), monta o carrinho com um ou mais produtos/quantidades e escolhe a forma de pagamento.
2. **Gravação:** A aplicação calcula o total somando cada item (preço da forma de pagamento escolhida, ou preço por kg pros itens por peso) e salva o pedido no IndexedDB como "pendente".
3. **Impressão:** Feita à parte, na aba Pendente — seleciona um ou mais pedidos e imprime; o recibo ESC/POS é construído e enviado via Web Bluetooth pra impressora térmica, e o(s) pedido(s) impresso(s) com sucesso viram "impresso".
4. **Acompanhamento:** o pedido segue pendente → impresso → entregue (ou cancelado a qualquer momento antes de entregue, reversível pela aba Cancelado); tudo consultável offline nas abas de status.
5. **Sincronização:** Service worker cacheia os arquivos na primeira visita; app continua funcionando sem rede depois disso.

## Notas de Implementação

- **Sem backend:** Todos os dados (clientes, produtos, pedidos) ficam no IndexedDB do navegador. Não há servidor.
- **Sem leitura automática de WhatsApp:** O proprietário digita manualmente o número e pedido.
- **Offline-first:** Service worker cacheia assets na primeira visita; app continua funcionando sem rede.
- **Impressora:** Única integração externa é via Bluetooth — não usa SPP (Bluetooth Clássico), apenas BLE GATT.
- **Preço por produto:** cada produto guarda 3 preços fixos (`prices.dinheiro`, `prices.pix`, `prices.cartao`) OU, se marcado como vendido por peso, um único `pricePerKg` — nunca os dois ao mesmo tempo. O total do pedido soma cada item com a regra que se aplica a ele.
- **Multi-cliente:** `config.js` é o único arquivo pensado pra mudar entre instalações do mesmo código — nome do negócio e feature flags (ex: desligar a venda por peso pra quem não usa). Veja [DEPLOY.md](DEPLOY.md) pra como publicar uma cópia nova por cliente sem afetar as demais.
