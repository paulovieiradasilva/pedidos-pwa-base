# Pedidos PWA

Uma aplicação web progressiva (PWA) que permite ao proprietário de uma distribuidora de água e gás transformar pedidos recebidos via WhatsApp em comprovantes impressos via impressora térmica Bluetooth e em uma lista diária organizada, sem duplicar manualmente o trabalho. A aplicação funciona completamente offline, com sincronização de dados via IndexedDB do navegador e impressão direta via Web Bluetooth API.

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

3. **Recarregue a aplicação no tablet com internet:**
   Acesse a URL da aplicação no tablet com conexão de rede ativa. O service worker detectará a nova versão e atualizará o cache automaticamente na próxima recarga. Não é necessário reinstalar a aplicação — basta abrir de novo com internet para buscar a versão mais recente.

## Requisitos do Web Bluetooth

- **Navegador:** Chrome ou navegadores baseados em Chromium (não funciona em Safari iOS).
- **Dispositivo:** Android com suporte a Bluetooth.
- **Contexto seguro:** A aplicação deve ser servida via HTTPS em produção ou `localhost` em desenvolvimento. Web Bluetooth não funciona em contextos inseguros (HTTP em IP local).
- **Impressora:** Uma impressora térmica 58mm com suporte a Bluetooth (BLE GATT), compatível com o protocolo ESC/POS.

## Estrutura do Projeto

```
.
├── index.html              # Arquivo principal da aplicação PWA
├── manifest.json           # Manifest do PWA (ícone, nome, tema)
├── service-worker.js       # Service worker para cache offline
├── icon-192.png           # Ícone da aplicação (192x192px)
│
├── js/                     # Módulos JavaScript (ES modules)
│   ├── app.js             # Componente Alpine.js principal wiring da UI
│   ├── db.js              # Wrapper do IndexedDB (open/get/put/getAll)
│   ├── customers.js       # Busca/salva cliente por telefone
│   ├── products.js        # Catálogo de produtos com seed padrão
│   ├── orders.js          # Criação de pedidos, cálculo de total e troco
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

### Fluxo de Dados

1. **Entrada:** O proprietário digita telefone, endereço (se novo), seleciona produto/quantidade e método de pagamento.
2. **Processamento:** A aplicação calcula total e troco, cria pedido no IndexedDB com timestamp.
3. **Impressão:** ESC/POS recibo é construído e enviado via Web Bluetooth para impressora térmica.
4. **Armazenamento:** Pedido fica disponível offline; lista diária é consultável a qualquer momento.
5. **Sincronização:** Service worker cache garante que app funciona sem internet após primeiro acesso.

## Notas de Implementação

- **Sem backend:** Todos os dados (clientes, produtos, pedidos) ficam no IndexedDB do navegador. Não há servidor.
- **Sem leitura automática de WhatsApp:** O proprietário digita manualmente o número e pedido.
- **Offline-first:** Service worker cacheeia assets na primeira visita; app continua funcionando sem rede.
- **Impressora:** Única integração externa é via Bluetooth — não usa SPP (Bluetooth Clássico), apenas BLE GATT.
