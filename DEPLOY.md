# Publicar e distribuir por cliente

O app é 100% estático (sem backend) e cada instalação guarda os dados só no
celular de quem usa (IndexedDB). Por isso, distribuir pra um cliente novo
é publicar uma cópia do site pra ele — não precisa de servidor nenhum.

**Importante:** a impressora Bluetooth só conecta em contexto seguro
(HTTPS). Não dá pra testar isso abrindo o app pelo IP local do computador
no celular — precisa ser pelo link publicado.

**Hospedagem: GitHub Pages** (não Netlify). Testamos o Netlify antes e ele
injeta automaticamente um selinho/HUD ("Built on Netlify") em todo site do
plano gratuito, visível pros clientes e sem como desligar sem plano pago.
GitHub Pages não tem nada parecido — nunca mostra marca nenhuma pro
visitante.

## 1. Publicar este repositório (uma vez)

1. Criar um repositório no GitHub e dar `git push` neste projeto pra lá.
   **O repositório precisa ser público** — no plano gratuito do GitHub, o
   GitHub Pages só funciona em repositório público (repositório privado
   exige o plano pago GitHub Pro). Se o repositório já existir como
   privado: **Settings → General → Danger Zone → Change repository
   visibility → Change to public** (confirma digitando o nome do
   repositório). Isso expõe o código-fonte pra qualquer pessoa — não tem
   segredo/senha no código, só configuração de negócio, mas a decisão é
   sua.
2. No repositório, ir em **Settings → Pages** → Source: `Deploy from a
   branch` → branch `main`, pasta `/ (root)` → Save. Em alguns minutos o
   GitHub dá um link tipo `https://<usuario>.github.io/<repo>/`.
3. Ainda em **Settings → General**, marcar a caixa **Template repository**.
   Isso deixa esse repositório disponível como "modelo" pra criar cópias.

Esse link já serve pra você instalar no seu próprio celular: abre no
Chrome Android e usa **⋮ → Adicionar à tela inicial**.

Depois de instalado, o app se atualiza sozinho (o service worker checa
por versão nova toda vez que o app volta pro primeiro plano) — não
precisa mais remover e reinstalar a cada `git push` novo.

## 2. Criar a cópia de um cliente novo

1. Na página do repositório modelo no GitHub, clicar **Use this template**
   → **Create a new repository** → dar um nome (ex: `pedidos-agua-joao`).
   Na tela de criação, deixar marcado **Public** (mesmo motivo do passo 1:
   GitHub Pages grátis não funciona em repositório privado).
2. Clonar esse repositório novo na sua máquina.
3. Editar `config.js`:
   ```js
   window.APP_CONFIG = {
     businessName: 'Água do João',
     features: {
       soldByWeight: true // false se esse cliente não usa venda por peso
     }
   };
   ```
4. Editar `manifest.json` (nome exibido embaixo do ícone na tela inicial,
   cor do tema, ícone — se o cliente tiver um).
5. `git add -A && git commit -m "Config: Água do João" && git push`.
6. Ativar o GitHub Pages nesse repositório novo (mesmo passo do item 1.2).
7. Mandar o link pro cliente. Ele abre no Chrome Android e usa
   **⋮ → Adicionar à tela inicial** pra instalar como app.

Cada cliente fica com seu próprio repositório, link e dados — totalmente
isolado dos outros.

## 3. Pedido de customização de um cliente específico

- **Visual/marca** (nome, cor, ícone): editar `config.js`/`manifest.json`
  direto no repositório desse cliente — não mexe no modelo, não afeta
  ninguém.
- **Comportamento** (ex: desligar um recurso): virar uma chave nova em
  `features` dentro de `config.js`, e o código em `js/app.js` checar essa
  chave (mesmo padrão já usado por `features.soldByWeight`). A chave só
  existe ligada no repositório do cliente que pediu — os outros nem
  sabem que ela existe.
- Nunca editar `index.html`/`js/*.js` direto num repositório de cliente
  pra resolver um pedido pontual — isso quebra o histórico e complica
  trazer correções do modelo depois. Sempre que possível, resolva com uma
  flag nova em `features`.

## 4. Trazer atualização do modelo pro repositório de um cliente

Uma vez, no repositório do cliente:
```bash
git remote add upstream https://github.com/<usuario>/<repo-modelo>.git
```

Sempre que quiser atualizar esse cliente com correções/novidades do
modelo:
```bash
git fetch upstream
git merge upstream/main
```
Como o repositório do cliente só mexeu em `config.js`/`manifest.json`,
conflito é raro. Se acontecer, resolve normalmente e testa antes de
publicar.
