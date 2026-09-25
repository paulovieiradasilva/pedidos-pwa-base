// Componente principal do app (Alpine.js). Registra um único objeto grande
// ("pedidosApp") com todo o estado (dados na tela) e todas as ações (funções)
// usadas pelo index.html. Está organizado em blocos marcados com "=====" abaixo,
// na ordem: navegação/histórico, telefone/endereço, carrinho, formulário de
// pedido, lista de pedidos, ações do pedido, labels/histórico de auditoria,
// ícones, e formulário de produto.

import { listAuditLog } from './auditLog.js';
import { findCustomerByPhone, listCustomers, saveCustomer } from './customers.js';
import { BACKUP_TEXT_SOFT_LIMIT, BackupError, backupFileName, daysSinceBackup, encodeBackupText, exportBackup, isBackupOverdue, parseBackup, parseBackupText, restoreBackup } from './backup.js';
import { DriveError, downloadBackup, listBackups, requestDriveToken, uploadBackup } from './drive.js';
import { deleteDatabase } from './db.js';
import { createOrder, listAllOrders, listOrdersForDay, localDateString, removeOrder, updateOrder, updateOrderStatus } from './orders.js';
import { buildClosingReceiptBytes, buildReceiptBytes, connectPrinter, printReceipt } from './printer.js';
import { listActiveProducts, listProducts, saveProduct, seedProductsIfEmpty, setProductActive } from './products.js';

const VALID_DDDS = new Set([
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '24',
  '27', '28',
  '31', '32', '33', '34', '35', '37', '38',
  '41', '42', '43', '44', '45', '46', '47', '48', '49',
  '51', '53', '54', '55',
  '61', '62', '63', '64', '65', '66', '67', '68', '69',
  '71', '73', '74', '75', '77', '79',
  '81', '82', '83', '84', '85', '86', '87', '88', '89',
  '91', '92', '93', '94', '95', '96', '97', '98', '99'
]);

// Valida um telefone brasileiro: DDD existente + celular (9 dígitos, começa com
// 9) ou fixo (10 dígitos, não pode começar com 0 ou 1).
function isValidBrazilianPhone(digits) {
  if (digits.length !== 10 && digits.length !== 11) return false;
  const ddd = digits.slice(0, 2);
  if (!VALID_DDDS.has(ddd)) return false;
  const firstNumberDigit = digits[2];
  if (digits.length === 11) return firstNumberDigit === '9';
  return firstNumberDigit !== '0' && firstNumberDigit !== '1';
}

const ADDRESS_LOWERCASE_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

// Deixa o endereço digitado com Primeira Letra Maiúscula em cada palavra,
// exceto conectivos comuns (de, da, do...) quando não são a primeira palavra.
function capitalizeAddress(text) {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\p{L}+/gu, (word, offset) => {
      if (offset !== 0 && ADDRESS_LOWERCASE_WORDS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    });
}

document.addEventListener('alpine:init', () => {
  Alpine.data('pedidosApp', () => ({
    currentView: 'pedidosDoDia',

    phone: '',
    address: '',
    products: [],
    activeProducts: [],
    customers: [],
    phoneSuggestions: [],
    addressSuggestions: [],
    customerMatchStatus: null,
    phoneError: '',
    selectedProductId: '',
    productPickerOpen: false,
    productPickerQuery: '',
    qty: null,
    weightGrams: null,
    weightManualTotal: null,
    weightTotalTouched: false,
    cartItems: [],
    editingOrderId: null,
    editingCartItemIndex: null,
    clienteCardCollapsed: false,
    productCardCollapsed: false,
    paymentMethod: '',
    changeFor: null,
    toastMessage: '',
    toastVisible: false,
    toastTimer: null,
    showOrderForm: false,
    todayOrders: [],
    orderPage: 1,
    orderPageSize: 5,
    orderSortDirection: 'desc',
    orderSearchQuery: '',
    orderSearchResults: [],
    selectedDate: localDateString(new Date()),
    paymentFilter: { dinheiro: true, pix: true, cartao: true },
    orderStatusTab: 'pendente',
    selectedOrderIds: [],
    openOrderMenuId: null,
    printerCharacteristic: null,
    auditLog: [],
    auditCurrentOrders: {},
    historicoDate: localDateString(new Date()),
    menuOpen: false,
    lastBackupAt: null,
    backupOverdue: false,
    storagePersisted: null,
    restorePending: null,
    sheetOpen: false,
    sheetKind: 'backup',
    sheetBusy: false,
    driveBackups: [],
    restoreText: '',
    appVersionInfo: null,

    productForm: {
      id: null,
      name: '',
      brand: '',
      soldByWeight: false,
      pricePerKg: null,
      priceDinheiro: null,
      pricePix: null,
      priceCartao: null
    },

    priceSyncPix: true,
    priceSyncCartao: true,
    productFormError: '',
    showProductForm: false,
    productSearch: '',
    productFilter: 'active',

    // ===== Ciclo de vida, navegação entre abas, toast, menu de desenvolvedor =====

    // Roda uma vez quando o app abre: garante o catálogo padrão de produtos e
    // já carrega a aba inicial (Pedidos do Dia).
    async init() {
      await seedProductsIfEmpty();
      await this.setView('pedidosDoDia');
      this.loadAppVersionInfo();
      this.requestPersistentStorage();
    },

    // Descobre quando o index.html mudou de verdade no servidor (cabeçalho
    // Last-Modified da própria resposta) e guarda pra mostrar no rodapé —
    // não depende de bumpar nenhum número manualmente a cada deploy. Se
    // estiver offline ou o servidor não mandar o cabeçalho, só não mostra
    // nada (não quebra o app).
    async loadAppVersionInfo() {
      try {
        const response = await fetch('./index.html', { cache: 'no-store' });
        const lastModified = response.headers.get('last-modified');
        if (!lastModified) return;
        const date = new Date(lastModified);
        this.appVersionInfo = `Atualizado em ${date.toLocaleString('pt-BR', {
          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        })}`;
      } catch {
        // offline ou sem o cabeçalho — sem rodapé, sem quebrar nada.
      }
    },

    // Mostra a notificação (toast) no rodapé por alguns segundos.
    showToast(message) {
      clearTimeout(this.toastTimer);
      this.toastMessage = message;
      this.toastVisible = true;
      this.toastTimer = setTimeout(() => {
        this.toastVisible = false;
      }, 4000);
    },

    // Troca de aba (Pedidos do Dia / Produtos / Histórico) e recarrega os
    // dados que aquela aba precisa mostrar.
    async setView(view) {
      this.currentView = view;
      if (view === 'produtos') {
        this.products = await listProducts();
      } else if (view === 'pedidosDoDia') {
        this.products = await listProducts();
        this.activeProducts = await listActiveProducts();
        this.customers = await listCustomers();
        this.selectedOrderIds = [];
        await this.refreshOrders();
      } else if (view === 'historico') {
        await this.refreshHistorico();
      }
    },

    // Recarrega os dados da aba Histórico: o log de auditoria, os pedidos
    // atuais (fallback para entradas antigas sem `orderAfter`) e produtos.
    async refreshHistorico() {
      const [auditLog, allOrders, products] = await Promise.all([listAuditLog(), listAllOrders(), listProducts()]);
      this.auditLog = auditLog;
      this.auditCurrentOrders = Object.fromEntries(allOrders.map(o => [o.id, o]));
      this.products = products;
    },

    // Avança/volta o dia mostrado na aba Histórico (deltaDays: +1 ou -1).
    shiftHistoricoDate(deltaDays) {
      const [y, m, d] = this.historicoDate.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      date.setDate(date.getDate() + deltaDays);
      this.historicoDate = localDateString(date);
    },

    // Controla se o menu de desenvolvedor ("Limpar dados") aparece na navegação.
    devModeEnabled() {
      return window.APP_CONFIG?.features?.devMode ?? false;
    },

    // ===== Menu lateral (☰) e backup/restauração dos dados =====

    // Abre/fecha o menu lateral; ao abrir, atualiza o status do backup.
    toggleMenu() {
      this.menuOpen = !this.menuOpen;
      if (this.menuOpen) this.refreshBackupStatus();
    },

    // Pede ao navegador pra não apagar os dados do app sozinho (quando o
    // celular está com pouco espaço). Silencioso; o resultado aparece no menu.
    async requestPersistentStorage() {
      try {
        if (!navigator.storage?.persist) return;
        this.storagePersisted = (await navigator.storage.persisted?.()) || (await navigator.storage.persist());
      } catch {
        this.storagePersisted = null;
      }
    },

    // Lê quando foi o último backup e decide se está atrasado (só cobra
    // backup de quem já tem pelo menos um pedido).
    async refreshBackupStatus() {
      try {
        this.lastBackupAt = localStorage.getItem('pedidos:lastBackupAt');
      } catch {
        this.lastBackupAt = null;
      }
      const days = window.APP_CONFIG?.features?.backupReminderDays ?? 7;
      const hasOrders = (await listAllOrders()).length > 0;
      this.backupOverdue = hasOrders && isBackupOverdue(this.lastBackupAt, days);
    },

    // Texto do "Último backup" no menu.
    lastBackupLabel() {
      const days = daysSinceBackup(this.lastBackupAt);
      if (days === null) return 'Nunca feito';
      if (days === 0) return 'Hoje';
      if (days === 1) return 'Ontem';
      return `Há ${days} dias`;
    },

    // ===== Folha de opções: onde guardar / de onde restaurar o backup =====

    // O Google Drive só aparece quando o cliente tem o ID do Google configurado (config.js).
    driveEnabled() {
      return Boolean(window.APP_CONFIG?.features?.googleClientId);
    },

    // Abre a folha de opções. kind: 'backup' | 'restore'. Fecha o menu lateral.
    openSheet(kind) {
      this.menuOpen = false;
      this.sheetKind = kind;
      this.restoreText = '';
      this.sheetOpen = true;
    },

    closeSheet() {
      this.sheetOpen = false;
    },

    // Mostra o erro de uma operação (mensagem pronta quando vem do Drive/backup).
    showBackupError(error, fallback) {
      const known = error instanceof DriveError || error instanceof BackupError;
      this.showToast(known ? error.message : fallback);
    },

    // Backup no Google Drive do cliente.
    async backupToDrive() {
      if (this.sheetBusy) return;
      this.sheetBusy = true;
      try {
        const token = await requestDriveToken(window.APP_CONFIG.features.googleClientId);
        const backup = await exportBackup();
        await uploadBackup(token, backup, backupFileName());
        this.markBackupDone();
        this.sheetOpen = false;
        this.showToast('Backup salvo no seu Google Drive.');
      } catch (error) {
        this.showBackupError(error, 'Não foi possível salvar no Drive. Tente de novo.');
      } finally {
        this.sheetBusy = false;
      }
    },

    // Backup em texto: abre o Gmail/WhatsApp com o backup no corpo da mensagem.
    // Sem compartilhar, copia o texto pra colar onde quiser.
    async backupByText() {
      if (this.sheetBusy) return;
      this.sheetBusy = true;
      try {
        const text = await encodeBackupText(await exportBackup());
        const title = `Backup Pedidos ${new Date().toLocaleDateString('pt-BR')}`;
        const tooBig = text.length > BACKUP_TEXT_SOFT_LIMIT;

        if (navigator.share) {
          try {
            await navigator.share({ title, text });
            this.markBackupDone();
            this.sheetOpen = false;
            this.showToast(tooBig ? 'Backup enviado. Ele é grande: se o WhatsApp cortar, use o e-mail ou o Drive.' : 'Backup pronto. Guarde a mensagem.');
            return;
          } catch (error) {
            if (error?.name === 'AbortError') return;
          }
        }
        await navigator.clipboard.writeText(text);
        this.markBackupDone();
        this.sheetOpen = false;
        this.showToast('Backup copiado. Cole no e-mail ou no WhatsApp e envie pra você.');
      } catch (error) {
        this.showBackupError(error, 'Não foi possível gerar o backup em texto.');
      } finally {
        this.sheetBusy = false;
      }
    },

    // Backup em arquivo: tenta compartilhar (só alguns navegadores deixam), depois
    // a janela "salvar como" (computador) e por fim baixa pra pasta Downloads.
    async backupToFile() {
      const backup = await exportBackup();
      const fileName = backupFileName();
      const json = JSON.stringify(backup);

      // O Chrome do Android só compartilha arquivos de tipos permitidos (texto,
      // imagem, PDF...) e application/json não está na lista. Então tenta como
      // JSON, depois como texto (.json e .txt) — o conteúdo é o mesmo.
      const candidates = [
        new File([json], fileName, { type: 'application/json' }),
        new File([json], fileName, { type: 'text/plain' }),
        new File([json], fileName.replace(/\.json$/, '.txt'), { type: 'text/plain' })
      ];
      const shareable = navigator.canShare ? candidates.find(f => navigator.canShare({ files: [f] })) : null;
      if (shareable) {
        try {
          await navigator.share({ files: [shareable], title: fileName });
          this.markBackupDone();
          this.sheetOpen = false;
          this.showToast('Backup pronto. Confira se foi salvo fora do celular.');
          return;
        } catch (error) {
          if (error?.name === 'AbortError') return;
        }
      }

      // Computador: janela do sistema pra escolher onde salvar.
      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: fileName,
            types: [{ description: 'Backup', accept: { 'application/json': ['.json'] } }]
          });
          const writable = await handle.createWritable();
          await writable.write(json);
          await writable.close();
          this.markBackupDone();
          this.sheetOpen = false;
          this.showToast('Backup salvo.');
          return;
        } catch (error) {
          if (error?.name === 'AbortError') return;
        }
      }

      const url = URL.createObjectURL(candidates[0]);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.markBackupDone();
      this.sheetOpen = false;
      this.showToast('Este navegador não compartilha arquivos: o backup ficou só neste celular. Use o Drive ou o e-mail pra guardar fora.');
    },

    // Restaurar do Google Drive: entra na conta, lista os últimos backups.
    async openDriveRestore() {
      if (this.sheetBusy) return;
      this.sheetBusy = true;
      try {
        const token = await requestDriveToken(window.APP_CONFIG.features.googleClientId);
        const files = await listBackups(token);
        if (files.length === 0) {
          this.showToast('Nenhum backup encontrado nessa conta do Google.');
          return;
        }
        this.driveBackups = files;
        this.sheetKind = 'drive';
      } catch (error) {
        this.showBackupError(error, 'Não foi possível abrir o Google Drive. Tente de novo.');
      } finally {
        this.sheetBusy = false;
      }
    },

    // Baixa o backup escolhido da lista do Drive e pede confirmação.
    async pickDriveBackup(file) {
      if (this.sheetBusy) return;
      this.sheetBusy = true;
      try {
        const token = await requestDriveToken(window.APP_CONFIG.features.googleClientId);
        this.restorePending = parseBackup(await downloadBackup(token, file.id));
        this.sheetOpen = false;
      } catch (error) {
        this.showBackupError(error, 'Não foi possível baixar esse backup.');
      } finally {
        this.sheetBusy = false;
      }
    },

    // Restaurar colando o texto recebido por e-mail/WhatsApp.
    openTextRestore() {
      this.restoreText = '';
      this.sheetKind = 'text';
    },

    async confirmTextRestore() {
      try {
        this.restorePending = await parseBackupText(this.restoreText);
        this.sheetOpen = false;
      } catch (error) {
        this.showBackupError(error, 'Não foi possível ler esse texto.');
      }
    },

    // Restaurar de um arquivo do celular (fecha a folha e abre o seletor de arquivos).
    pickRestoreFile() {
      this.sheetOpen = false;
      this.$refs.restoreInput.click();
    },

    markBackupDone() {
      const now = new Date().toISOString();
      try {
        localStorage.setItem('pedidos:lastBackupAt', now);
      } catch {
        // sem localStorage: só não lembra a data.
      }
      this.lastBackupAt = now;
      this.backupOverdue = false;
    },

    // Lê o arquivo escolhido e, se for um backup válido, pede confirmação.
    async onRestoreFileChosen(event) {
      const input = event.target;
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      try {
        this.restorePending = parseBackup(await file.text());
      } catch (error) {
        this.showToast(error instanceof BackupError ? error.message : 'Não foi possível ler o arquivo.');
      }
    },

    cancelRestore() {
      this.restorePending = null;
    },

    // Substitui os dados deste aparelho pelos do backup confirmado.
    async confirmRestore() {
      const backup = this.restorePending;
      if (!backup) return;
      try {
        await restoreBackup(backup);
      } catch {
        this.showToast('Não foi possível restaurar. Seus dados atuais foram mantidos.');
        return;
      }
      this.restorePending = null;
      this.menuOpen = false;
      this.showOrderForm = false;
      this.showProductForm = false;
      await this.setView('pedidosDoDia');
      await this.refreshBackupStatus();
      this.showToast('Backup restaurado.');
    },

    // Apaga TODOS os dados do app (pedidos, clientes, produtos, histórico) após
    // confirmação — usado só em desenvolvimento/testes (menu com devMode).
    async clearDatabase() {
      this.menuOpen = false;
      if (!confirm('Limpar todos os dados do app? Isso apaga pedidos, clientes, produtos e histórico definitivamente. Essa ação não pode ser desfeita.')) {
        return;
      }
      await deleteDatabase();
      window.location.reload();
    },

    // Filtra o log de auditoria para mostrar só as entradas do dia selecionado no Histórico.
    historicoEntriesForDay() {
      return this.auditLog.filter(e => localDateString(new Date(e.timestamp)) === this.historicoDate);
    },

    setOrderStatusTab(tab) {
      this.orderStatusTab = tab;
      this.selectedOrderIds = [];
      this.orderPage = 1;
    },

    formatCurrency(value) {
      return (value ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    // ===== Telefone/endereço: máscara, autocomplete de cliente =====

    // Aplica a máscara "(DD) DDDDD-DDDD" enquanto o usuário digita o telefone.
    formatPhoneMask(value) {
      const digits = value.replace(/\D/g, '').slice(0, 11);
      if (digits.length <= 2) return digits;
      if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
      if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    },

    // Ao digitar o telefone: aplica a máscara e sugere clientes já cadastrados
    // com telefone parecido (autocomplete).
    onPhoneInput(event) {
      this.phone = this.formatPhoneMask(event.target.value);
      event.target.value = this.phone;
      this.phoneError = '';
      const digits = this.phoneDigits();
      this.phoneSuggestions = digits.length >= 3
        ? this.customers.filter(c => c.phone.includes(digits))
        : [];
    },

    // Remove acentos e caixa alta/baixa para comparar textos na busca
    // (ex.: "José" e "jose" são considerados iguais).
    normalizeSearchText(value) {
      return value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .trim()
        .toLowerCase();
    },

    // Ao digitar o endereço: sugere clientes já cadastrados com endereço parecido.
    onAddressInput(value) {
      this.address = value;
      const query = this.normalizeSearchText(value);
      this.addressSuggestions = query.length >= 3
        ? this.customers.filter(c => this.normalizeSearchText(c.address ?? '').includes(query))
        : [];
    },

    // Preenche telefone/endereço com os dados de um cliente escolhido na sugestão.
    applyCustomerSelection(customer) {
      this.phone = this.formatPhoneMask(customer.phone);
      this.address = customer.address;
      this.customerMatchStatus = 'existing';
      this.phoneSuggestions = [];
      this.addressSuggestions = [];
      if (document.activeElement) document.activeElement.blur();
    },

    // Chamada pela lista de sugestão de TELEFONE.
    selectPhoneSuggestion(customer) {
      this.applyCustomerSelection(customer);
    },

    // Chamada pela lista de sugestão de ENDEREÇO.
    selectAddressSuggestion(customer) {
      this.applyCustomerSelection(customer);
    },

    // Retorna só os dígitos do telefone (sem parênteses/traço/espaço).
    phoneDigits() {
      return this.phone.replace(/\D/g, '');
    },

    // Ao sair do campo telefone: valida o número e verifica se já existe
    // cliente com esse telefone (preenchendo o endereço automaticamente).
    async lookupCustomer() {
      const digits = this.phoneDigits();
      if (digits.length !== 10 && digits.length !== 11) {
        this.customerMatchStatus = null;
        this.phoneError = '';
        return;
      }
      if (!isValidBrazilianPhone(digits)) {
        this.customerMatchStatus = null;
        this.phoneError = 'Telefone inválido — confira o DDD e o número.';
        return;
      }
      this.phoneError = '';
      const customer = await findCustomerByPhone(digits);
      if (customer) {
        this.address = customer.address;
        this.customerMatchStatus = 'existing';
      } else {
        this.customerMatchStatus = 'new';
      }
    },

    // ===== Carrinho do pedido novo (adicionar/remover itens, calcular total) =====

    // Retorna o produto atualmente selecionado no formulário de novo item.
    selectedNewOrderProduct() {
      return this.activeProducts.find(p => p.id === this.selectedProductId);
    },

    // Abre/fecha a lista de produtos (usada no lugar de um <select> nativo,
    // pra poder mostrar nome e marca em linhas separadas, sem preço).
    // Sempre abre com a busca limpa, pra não esconder produtos por engano
    // com um filtro de uma vez anterior.
    toggleProductPicker() {
      this.productPickerOpen = !this.productPickerOpen;
      this.productPickerQuery = '';
    },

    // Escolhe um produto na lista, fecha ela e limpa a busca. Se o produto for
    // vendido por peso e já tiver gramas digitadas (e o usuário não tiver
    // sobrescrito o valor manualmente), recalcula o total com o preço/kg do
    // produto recém-escolhido — senão ficava com o valor calculado pro produto
    // anterior.
    chooseOrderProduct(productId) {
      this.selectedProductId = productId;
      this.productPickerOpen = false;
      this.productPickerQuery = '';
      const product = this.selectedNewOrderProduct();
      if (product?.soldByWeight && this.weightGrams != null) {
        this.weightTotalTouched = false;
        this.weightManualTotal = Math.round(product.pricePerKg * (this.weightGrams / 1000) * 100) / 100;
      }
    },

    // Lista de produtos ativos filtrada pela busca do seletor (nome ou marca).
    filteredActiveProducts() {
      const query = this.normalizeSearchText(this.productPickerQuery);
      if (!query) return this.activeProducts;
      return this.activeProducts.filter(p =>
        this.normalizeSearchText(this.productDisplayName(p)).includes(query)
      );
    },

    // Ao digitar o peso (gramas) de um produto vendido a granel: sempre
    // recalcula o valor total (peso x preço/kg) — mudar a quantidade é como
    // a pessoa pede um novo cálculo, mesmo que tenha digitado um valor
    // manual antes. Um valor manual só "gruda" enquanto as gramas não mudam.
    onWeightGramsInput(value) {
      this.weightGrams = value === '' ? null : Number(value);
      const product = this.selectedNewOrderProduct();
      if (product && this.weightGrams != null) {
        this.weightManualTotal = Math.round(product.pricePerKg * (this.weightGrams / 1000) * 100) / 100;
        this.weightTotalTouched = false;
      }
    },

    // Permite digitar o valor total manualmente, sobrepondo o cálculo automático.
    onWeightTotalInput(value) {
      this.weightManualTotal = value === '' ? null : Number(value);
      this.weightTotalTouched = true;
    },

    // Confere se o item que está sendo montado (produto + quantidade/peso)
    // pode ser adicionado ao carrinho; retorna a mensagem de erro, ou null se ok.
    validateCurrentItem() {
      if (!this.selectedProductId) {
        return 'Selecione um produto antes de adicionar.';
      }
      const selectedProduct = this.selectedNewOrderProduct();
      if (!selectedProduct) {
        return 'Produto selecionado não está mais disponível. Selecione novamente.';
      }
      if (selectedProduct.soldByWeight) {
        if (!this.weightGrams || this.weightGrams <= 0) {
          return 'Informe a quantidade em gramas antes de adicionar.';
        }
      } else if (!Number.isInteger(this.qty) || this.qty <= 0) {
        return 'Informe uma quantidade válida antes de adicionar.';
      }
      return null;
    },

    onQtyInput(value) {
      this.qty = value === '' ? null : Number(value);
    },

    // Adiciona o item atual ao carrinho (ou salva a edição, se estava editando um item existente).
    addCartItem() {
      const error = this.validateCurrentItem();
      if (error) {
        this.showToast(error);
        return;
      }

      const selectedProduct = this.selectedNewOrderProduct();
      const item = selectedProduct.soldByWeight
        ? { productId: this.selectedProductId, productName: this.productDisplayName(selectedProduct), grams: this.weightGrams, manualTotal: this.weightManualTotal }
        : { productId: this.selectedProductId, productName: this.productDisplayName(selectedProduct), qty: this.qty };

      if (this.editingCartItemIndex != null) {
        this.cartItems[this.editingCartItemIndex] = item;
        this.editingCartItemIndex = null;
      } else {
        this.cartItems.push(item);
      }

      this.selectedProductId = '';
      this.qty = null;
      this.weightGrams = null;
      this.weightManualTotal = null;
      this.weightTotalTouched = false;
    },

    // Carrega um item do carrinho de volta no formulário para editar.
    startEditCartItem(index) {
      const item = this.cartItems[index];
      this.selectedProductId = item.productId;
      if (item.grams != null) {
        this.weightGrams = item.grams;
        this.weightManualTotal = item.manualTotal;
        this.weightTotalTouched = false;
        this.qty = null;
      } else {
        this.qty = item.qty;
        this.weightGrams = null;
        this.weightManualTotal = null;
        this.weightTotalTouched = false;
      }
      this.editingCartItemIndex = index;
      this.productCardCollapsed = false;
    },

    // Remove um item do carrinho.
    removeCartItem(index) {
      this.cartItems.splice(index, 1);
      if (this.editingCartItemIndex === index) {
        this.editingCartItemIndex = null;
      }
    },

    // Valor de uma linha do carrinho (usado para mostrar e somar o total do pedido).
    cartItemLineTotal(item) {
      if (item.grams != null) return item.manualTotal ?? 0;
      const product = this.products.find(p => p.id === item.productId);
      if (!product || !this.paymentMethod) return 0;
      return product.prices[this.paymentMethod] * item.qty;
    },

    // Soma o valor de todos os itens do carrinho (total do pedido em edição/criação).
    orderTotal() {
      if (!this.paymentMethod) return 0;
      return this.cartItems.reduce((sum, item) => sum + this.cartItemLineTotal(item), 0);
    },

    // Calcula o troco a devolver com base no valor informado para troco (pagamento em dinheiro).
    changeAmountLive() {
      return Math.max((this.changeFor ?? 0) - this.orderTotal(), 0);
    },

    // Limpa o formulário de pedido (telefone, endereço, carrinho, pagamento etc.).
    resetForm() {
      this.phone = '';
      this.address = '';
      this.qty = null;
      this.weightGrams = null;
      this.weightManualTotal = null;
      this.weightTotalTouched = false;
      this.cartItems = [];
      this.editingCartItemIndex = null;
      this.paymentMethod = '';
      this.changeFor = null;
      this.selectedProductId = '';
      this.productPickerOpen = false;
      this.productPickerQuery = '';
      this.phoneSuggestions = [];
      this.addressSuggestions = [];
      this.customerMatchStatus = null;
      this.phoneError = '';
      this.clienteCardCollapsed = false;
      this.productCardCollapsed = false;
    },

    // Abre/fecha os cards de "Cliente" e "Adicionar produto" no formulário de
    // pedido — colapsar libera espaço na tela depois que a seção já foi
    // preenchida.
    toggleClienteCard() {
      this.clienteCardCollapsed = !this.clienteCardCollapsed;
    },
    toggleProductCard() {
      this.productCardCollapsed = !this.productCardCollapsed;
    },

    // ===== Abrir/editar/salvar formulário de pedido =====

    // Abre o formulário zerado para criar um pedido novo.
    async openNewOrderForm() {
      this.resetForm();
      this.editingOrderId = null;
      this.showOrderForm = true;
      this.customers = await listCustomers();
      this.activeProducts = await listActiveProducts();
    },

    // Abre o formulário já preenchido com os dados de um pedido existente, para editar.
    async startEditOrder(order) {
      this.editingOrderId = order.id;
      this.phone = this.formatPhoneMask(order.customerPhone);
      this.address = order.address ?? '';
      this.paymentMethod = order.paymentMethod;
      this.changeFor = order.changeFor ?? null;
      this.cartItems = order.items.map(item => ({
        ...item,
        productName: this.productDisplayName(this.products.find(p => p.id === item.productId))
      }));
      this.selectedProductId = '';
      this.qty = null;
      this.weightGrams = null;
      this.weightManualTotal = null;
      this.weightTotalTouched = false;
      this.editingCartItemIndex = null;
      this.phoneSuggestions = [];
      this.addressSuggestions = [];
      this.customerMatchStatus = null;
      this.phoneError = '';
      // Cliente já preenchido — começa colapsado pra sobrar espaço pra mexer nos itens.
      this.clienteCardCollapsed = true;
      this.productCardCollapsed = false;
      this.customers = await listCustomers();
      this.activeProducts = await listActiveProducts();
      this.showOrderForm = true;
    },

    // Fecha o formulário de pedido sem salvar.
    closeOrderForm() {
      this.resetForm();
      this.editingOrderId = null;
      this.showOrderForm = false;
    },

    // Valida o formulário (telefone, itens, produto ainda existe, pagamento,
    // troco suficiente, endereço) e grava o pedido — cria um novo ou atualiza
    // o que está em edição. Também salva/atualiza o cliente pelo telefone.
    async saveOrder() {
      const phoneDigits = this.phoneDigits();
      if (!isValidBrazilianPhone(phoneDigits)) {
        this.phoneError = 'Telefone inválido — confira o DDD e o número.';
        this.showToast('Informe um telefone válido (DDD + número).');
        return;
      }

      if (this.cartItems.length === 0) {
        this.showToast('Adicione ao menos um item antes de gravar.');
        return;
      }

      const missingProduct = this.cartItems.find(item => !this.products.some(p => p.id === item.productId));
      if (missingProduct) {
        this.showToast(`Produto "${missingProduct.productName}" não está mais disponível. Remova esse item e tente novamente.`);
        return;
      }

      if (!this.paymentMethod) {
        this.showToast('Selecione a forma de pagamento antes de gravar.');
        return;
      }

      if (this.paymentMethod === 'dinheiro' && this.changeFor != null) {
        const prospectiveTotal = this.orderTotal();
        if (this.changeFor < prospectiveTotal) {
          this.showToast('Troco para valor menor que o total do pedido. Verifique o valor informado.');
          return;
        }
      }

      if (!this.address) {
        this.showToast('Informe o endereço antes de gravar.');
        return;
      }
      this.address = capitalizeAddress(this.address);
      await saveCustomer(phoneDigits, this.address);

      const orderInput = {
        customerPhone: phoneDigits,
        address: this.address,
        items: this.cartItems.map(({ productName, ...item }) => item),
        paymentMethod: this.paymentMethod,
        changeFor: this.paymentMethod === 'dinheiro' ? this.changeFor : undefined
      };

      if (this.editingOrderId) {
        await updateOrder(this.editingOrderId, orderInput);
        this.showToast('Pedido atualizado.');
      } else {
        await createOrder(orderInput);
        this.showToast('Pedido gravado.');
      }

      this.closeOrderForm();
      if (this.selectedDate === localDateString(new Date())) {
        await this.refreshOrders();
      }
    },

    // ===== Lista de pedidos: busca, filtro, paginação, ordenação =====

    // Recarrega a lista de pedidos do dia selecionado (e reaplica a busca, se houver).
    async refreshOrders() {
      this.todayOrders = await listOrdersForDay(this.selectedDate);
      if (this.orderSearchQuery.trim()) {
        await this.searchOrders();
      }
      this.orderPage = 1;
      this.selectedOrderIds = [];
      this.refreshBackupStatus();
    },

    // Ao digitar na busca de pedidos.
    onOrderSearchInput(value) {
      this.orderSearchQuery = value;
      this.searchOrders();
    },

    // Busca pedidos em TODO o histórico (não só no dia selecionado) por
    // telefone ou endereço parecido com o termo digitado.
    async searchOrders() {
      const query = this.orderSearchQuery.trim();
      if (!query) {
        this.orderSearchResults = [];
        this.orderPage = 1;
        return;
      }
      const normalizedQuery = this.normalizeSearchText(query);
      const digitsQuery = query.replace(/\D/g, '');
      const all = await listAllOrders();
      this.orderSearchResults = all.filter(o => {
        const addressMatch = this.normalizeSearchText(o.address ?? '').includes(normalizedQuery);
        const phoneMatch = digitsQuery.length > 0 && (o.customerPhone ?? '').includes(digitsQuery);
        return addressMatch || phoneMatch;
      });
      this.orderPage = 1;
      this.selectedOrderIds = [];
    },

    // Limpa a busca e volta a mostrar os pedidos do dia selecionado.
    clearOrderSearch() {
      this.orderSearchQuery = '';
      this.orderSearchResults = [];
      this.orderPage = 1;
    },

    // Lista base a ser exibida: resultado da busca se houver termo digitado,
    // senão os pedidos do dia selecionado.
    currentOrders() {
      return this.orderSearchQuery.trim() ? this.orderSearchResults : this.todayOrders;
    },

    // Formata "AAAA-MM-DD" como "DD/MM/AAAA" para exibir na tela.
    formatDateDisplay(isoDate) {
      const [y, m, d] = isoDate.split('-');
      return `${d}/${m}/${y}`;
    },

    // Data de criação do pedido, formatada para exibição.
    formatOrderDate(order) {
      return new Date(order.createdAt).toLocaleDateString('pt-BR');
    },

    // Avança/volta o dia mostrado na aba Pedidos do Dia.
    async shiftDate(deltaDays) {
      const [y, m, d] = this.selectedDate.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      date.setDate(date.getDate() + deltaDays);
      this.selectedDate = localDateString(date);
      await this.refreshOrders();
    },

    // Aplica o filtro de status (aba pendente/impresso/entregue/cancelado) e de
    // forma de pagamento, e a ordenação (mais recente/mais antigo primeiro).
    filteredOrders() {
      const filtered = this.currentOrders()
        .filter(o => o.status === this.orderStatusTab)
        .filter(o => this.paymentFilter[o.paymentMethod]);
      return this.orderSortDirection === 'asc' ? [...filtered].reverse() : filtered;
    },

    // Soma o total de todos os pedidos que passaram pelo filtro atual.
    filteredTotal() {
      return this.filteredOrders().reduce((sum, o) => sum + o.total, 0);
    },

    // Fatia a lista filtrada para mostrar só a página atual (paginação).
    visibleOrders() {
      const start = (this.orderPage - 1) * this.orderPageSize;
      return this.filteredOrders().slice(start, start + this.orderPageSize);
    },

    // Quantidade total de páginas, de acordo com o filtro e o tamanho de página escolhido.
    totalOrderPages() {
      return Math.max(1, Math.ceil(this.filteredOrders().length / this.orderPageSize));
    },

    prevOrderPage() {
      if (this.orderPage > 1) this.orderPage -= 1;
    },

    nextOrderPage() {
      if (this.orderPage < this.totalOrderPages()) this.orderPage += 1;
    },

    // Alterna entre mostrar os pedidos do mais novo ou do mais antigo primeiro.
    toggleOrderSort() {
      this.orderSortDirection = this.orderSortDirection === 'desc' ? 'asc' : 'desc';
      this.orderPage = 1;
    },

    // Muda quantos pedidos aparecem por página.
    onOrderPageSizeChange(value) {
      this.orderPageSize = Number(value);
      this.orderPage = 1;
    },

    // Volta para a primeira página quando um filtro (forma de pagamento) muda.
    onFilterChange() {
      this.orderPage = 1;
    },

    // ===== Ações do pedido: marcar entregue, cancelar, reverter, excluir, imprimir =====

    // Marca/desmarca um pedido na seleção em massa (usada para imprimir vários de uma vez).
    toggleOrderSelected(orderId) {
      this.selectedOrderIds = this.selectedOrderIds.includes(orderId)
        ? this.selectedOrderIds.filter(id => id !== orderId)
        : [...this.selectedOrderIds, orderId];
    },

    // Monta o recibo do pedido, conecta na impressora (se ainda não estiver) e
    // imprime. `options.copy` marca como segunda via. Lança erro se falhar.
    // A impressora Bluetooth desconecta sozinha depois de um tempo parada (e o
    // celular às vezes nem avisa até tentar escrever). Se a característica que
    // já tínhamos falhar, reconecta (connectPrinter tenta em silêncio, sem
    // reabrir o seletor) e tenta mandar o recibo de novo uma única vez, pra não
    // precisar de um segundo toque só pra "acordar" a conexão.
    async printOrderReceipt(order, options = {}) {
      const customer = { phone: order.customerPhone, address: order.address };
      const bytes = buildReceiptBytes(order, customer, this.products, options);
      if (!this.printerCharacteristic) {
        this.printerCharacteristic = await connectPrinter();
      }
      try {
        await printReceipt(this.printerCharacteristic, bytes);
      } catch (error) {
        this.printerCharacteristic = await connectPrinter();
        await printReceipt(this.printerCharacteristic, bytes);
      }
    },

    // Imprime o recibo de cada pedido selecionado (via Bluetooth) e marca cada
    // um como "impresso"; se a impressão falhar, o pedido continua pendente.
    async printSelectedOrders() {
      const ids = [...this.selectedOrderIds];
      let printed = 0;
      let failed = 0;

      for (const id of ids) {
        const order = this.currentOrders().find(o => o.id === id);
        if (!order) continue;
        try {
          await this.printOrderReceipt(order);
          await updateOrderStatus(order.id, 'impresso');
          printed++;
        } catch (err) {
          this.printerCharacteristic = null;
          failed++;
        }
      }

      this.showToast(failed > 0
        ? `${printed} de ${ids.length} impressos. ${failed} falhou/falharam: mantido(s) em pendente.`
        : `${printed} pedido(s) impresso(s).`);
      this.selectedOrderIds = [];
      await this.refreshOrders();
    },

    // Reimprime o recibo de vários pedidos selecionados de uma vez (aba
    // Impresso) — útil pra reimprimir uma rota inteira. Cada um sai marcado
    // "2ª VIA"; não muda o status nem grava no Histórico, igual à reimpressão
    // individual (reprintOrder).
    async reprintSelectedOrders() {
      const ids = [...this.selectedOrderIds];
      let printed = 0;
      let failed = 0;

      for (const id of ids) {
        const order = this.currentOrders().find(o => o.id === id);
        if (!order) continue;
        try {
          await this.printOrderReceipt(order, { copy: true });
          printed++;
        } catch (err) {
          this.printerCharacteristic = null;
          failed++;
        }
      }

      this.showToast(failed > 0
        ? `${printed} de ${ids.length} recibos reimpressos. ${failed} falhou/falharam.`
        : `${printed} recibo(s) reimpresso(s).`);
      this.selectedOrderIds = [];
    },

    // Reimprime o recibo de um pedido já impresso (recibo perdido, danificado
    // ou nova tentativa de entrega), marcado como "2ª VIA". Não muda o status
    // (continua Impresso) nem grava no Histórico: o pedido em si não mudou.
    async reprintOrder(order) {
      this.openOrderMenuId = null;
      try {
        await this.printOrderReceipt(order, { copy: true });
        this.showToast('Recibo reimpresso.');
      } catch (err) {
        this.printerCharacteristic = null;
        this.showToast('Falha ao imprimir. Tente novamente.');
      }
    },

    // Imprime o recibo de fechamento de caixa do dia mostrado no Histórico
    // (totais por forma de pagamento, itens entregues, linha de assinatura).
    async printDailyClosing() {
      const dayOrders = await listOrdersForDay(this.historicoDate);
      if (dayOrders.length === 0) {
        this.showToast('Nenhum pedido nesse dia pra fechar.');
        return;
      }
      try {
        const printedAt = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const dateLabel = `${this.formatDateDisplay(this.historicoDate)} · ${printedAt}`;
        const bytes = buildClosingReceiptBytes(dayOrders, dateLabel, this.products, {
          businessName: window.APP_CONFIG?.businessName,
          title: window.APP_CONFIG?.closingReceiptTitle ?? 'FECHAMENTO'
        });
        if (!this.printerCharacteristic) {
          this.printerCharacteristic = await connectPrinter();
        }
        await printReceipt(this.printerCharacteristic, bytes);
        this.showToast('Fechamento impresso.');
      } catch (err) {
        this.printerCharacteristic = null;
        this.showToast('Falha ao imprimir o fechamento. Tente novamente.');
      }
    },

    // Marca o pedido como entregue.
    async markOrderDelivered(order) {
      await updateOrderStatus(order.id, 'entregue');
      await this.refreshOrders();
    },

    // Cancela o pedido (fica visível na aba "Cancelado", gera entrada no Histórico).
    async cancelOrder(order) {
      await updateOrderStatus(order.id, 'cancelado');
      await this.refreshOrders();
    },

    // Volta um pedido cancelado/entregue para pendente (gera entrada no Histórico).
    async revertOrderToPending(order) {
      await updateOrderStatus(order.id, 'pendente');
      await this.refreshOrders();
    },

    // Corrige um pedido marcado como "entregue" por engano, voltando pra
    // "Impresso" (o recibo já foi impresso, não precisa imprimir de novo).
    // Pede confirmação mostrando os dados do pedido, já que isso tira o
    // valor do fechamento de caixa do dia; gera entrada no Histórico.
    async revertOrderToImpresso(order) {
      const when = new Date(order.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const confirmed = confirm(
        `Voltar este pedido para Impresso?\n\n` +
        `${this.formatPhoneMask(order.customerPhone)} — ${order.address ?? 'sem endereço'}\n` +
        `R$ ${this.formatCurrency(order.total)} — pedido das ${when}\n\n` +
        `Ele sai do fechamento de caixa de hoje.`
      );
      if (!confirmed) return;
      await updateOrderStatus(order.id, 'impresso');
      await this.refreshOrders();
      this.showToast('Pedido voltou para Impresso.');
    },

    // Abre/fecha o menu "..." de ações de um pedido na lista.
    toggleOrderMenu(orderId) {
      this.openOrderMenuId = this.openOrderMenuId === orderId ? null : orderId;
    },

    // Exclui definitivamente um pedido (bloqueado para pedidos já entregues ou
    // cancelados), após confirmação. Fica registrado no Histórico antes de sumir.
    async deleteOrder(order) {
      this.openOrderMenuId = null;
      if (order.status === 'entregue' || order.status === 'cancelado') {
        this.showToast('Pedido entregue ou cancelado não pode ser excluído.');
        return;
      }
      if (!confirm('Excluir este pedido definitivamente? Essa ação não pode ser desfeita.')) {
        return;
      }
      await removeOrder(order.id);
      await this.refreshOrders();
      this.showToast('Pedido excluído.');
    },

    // ===== Textos/labels de exibição e renderização do Histórico (auditoria) =====

    // Nome exibido do produto (nome + marca, se tiver marca).
    productDisplayName(product) {
      return product.brand
        ? `${product.name} ${product.brand}`
        : product.name;
    },

    // Texto secundário do produto na lista (marca e "inativo", se for o caso).
    productSubtitle(product) {
      return [product.brand, product.active ? null : 'inativo'].filter(Boolean).join(' · ');
    },

    // Lista de textos "quantidade + nome do produto" para exibir os itens de um pedido.
    orderItemLabels(order) {
      return order.items.map(item => {
        const product = this.products.find(p => p.id === item.productId);
        const quantityLabel = item.grams != null
          ? `${parseFloat((item.grams / 1000).toFixed(3))}kg`
          : `${item.qty}x`;
        return product ? `${quantityLabel} ${this.productDisplayName(product)}` : `${quantityLabel} Produto removido`;
      });
    },

    // Nome em português da forma de pagamento.
    paymentMethodLabel(method) {
      return { dinheiro: 'Dinheiro', pix: 'Pix', cartao: 'Cartão' }[method] ?? method;
    },

    // Nome em português do status do pedido.
    orderStatusLabel(status) {
      return { pendente: 'Pendente', impresso: 'Impresso', entregue: 'Entregue', cancelado: 'Cancelado' }[status] ?? status;
    },

    // Título da entrada no Histórico (ex.: "Editado", "Excluído", ou o novo status).
    auditActionLabel(entry) {
      if (entry.action === 'status') return this.orderStatusLabel(entry.toStatus);
      return { edit: 'Editado', delete: 'Excluído' }[entry.action] ?? entry.action;
    },

    // Cor da bolinha da linha do tempo no Histórico, de acordo com o tipo de ação.
    auditDotClass(action) {
      return { edit: 'bg-blue-600', status: 'bg-purple-600', delete: 'bg-red-600' }[action] ?? 'bg-gray-400';
    },

    // Horário (HH:MM) da entrada do Histórico.
    formatAuditTime(entry) {
      return new Date(entry.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    },

    // Monta as linhas de texto que descrevem o que mudou numa edição/status/exclusão
    // (pagamento, endereço, itens). Usa `entry.orderAfter` (estado gravado no
    // momento exato da edição) quando existir; só cai no pedido atual como
    // fallback para entradas antigas gravadas antes dessa correção.
    auditChangeLines(entry) {
      if (entry.action === 'status') {
        return [`${this.orderStatusLabel(entry.fromStatus)} → ${this.orderStatusLabel(entry.toStatus)}`];
      }
      if (entry.action === 'delete') {
        return [];
      }
      const current = entry.orderAfter ?? this.auditCurrentOrders[entry.orderId];
      if (!current) return ['Dados editados'];
      const lines = [];
      if (current.paymentMethod !== entry.orderSnapshot.paymentMethod) {
        lines.push(`Pagamento: ${this.paymentMethodLabel(entry.orderSnapshot.paymentMethod)} → ${this.paymentMethodLabel(current.paymentMethod)}`);
      }
      if (current.address !== entry.orderSnapshot.address) {
        lines.push('Endereço alterado');
      }
      const itemDiffLines = this.auditItemsDiff(entry.orderSnapshot.items, current.items);
      if (itemDiffLines.length > 0) {
        lines.push('Itens alterados:');
        lines.push(...itemDiffLines);
      }
      return lines.length > 0 ? lines : ['Dados editados'];
    },

    // Compara os itens de antes e depois de uma edição e gera linhas "+ 2x Água"
    // / "− 1x Água" mostrando o que foi adicionado/removido.
    auditItemsDiff(oldItems, newItems) {
      const totals = (items) => {
        const map = {};
        for (const item of items) {
          if (!map[item.productId]) map[item.productId] = { qty: 0, grams: 0 };
          if (item.grams != null) map[item.productId].grams += item.grams;
          else map[item.productId].qty += item.qty ?? 0;
        }
        return map;
      };
      const before = totals(oldItems);
      const after = totals(newItems);
      const productIds = new Set([...Object.keys(before), ...Object.keys(after)]);

      const lines = [];
      for (const id of productIds) {
        const b = before[id] ?? { qty: 0, grams: 0 };
        const a = after[id] ?? { qty: 0, grams: 0 };
        const product = this.products.find(p => p.id === id);
        const label = product ? this.productDisplayName(product) : 'Produto removido';

        const qtyDelta = a.qty - b.qty;
        if (qtyDelta !== 0) {
          lines.push(`${qtyDelta > 0 ? '+' : '−'} ${Math.abs(qtyDelta)}x ${label}`);
        }
        const gramsDelta = a.grams - b.grams;
        if (gramsDelta !== 0) {
          const kg = parseFloat((Math.abs(gramsDelta) / 1000).toFixed(3));
          lines.push(`${gramsDelta > 0 ? '+' : '−'} ${kg}kg ${label}`);
        }
      }
      return lines;
    },

    // Linha de valor da entrada do Histórico: "R$ X → R$ Y" se o total mudou
    // nessa edição, senão só "R$ X" (mesma lógica de fallback do `auditChangeLines`).
    auditValueLine(entry) {
      if (entry.action === 'edit') {
        const current = entry.orderAfter ?? this.auditCurrentOrders[entry.orderId];
        if (current && current.total !== entry.orderSnapshot.total) {
          return `R$ ${this.formatCurrency(entry.orderSnapshot.total)} → R$ ${this.formatCurrency(current.total)}`;
        }
      }
      return `R$ ${this.formatCurrency(entry.orderSnapshot.total)}`;
    },

    // ===== Ícones SVG inline e classes de forma de pagamento =====

    // Retorna o SVG de um ícone pelo nome (usado em vez de biblioteca de ícones
    // externa, para o app funcionar 100% offline).
    icon(name, size = 16) {
      const paths = {
        add: { strokeWidth: 2.2, body: '<path d="M12 5v14M5 12h14"/>' },
        edit: { strokeWidth: 2, body: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>' },
        power: { strokeWidth: 2, body: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>' },
        close: { strokeWidth: 2, body: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>' },
        dinheiro: { strokeWidth: 2, body: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/>' },
        cartao: { strokeWidth: 2, body: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>' },
        pix: { strokeWidth: 2, body: '<rect x="4" y="4" width="16" height="16" rx="5" transform="rotate(45 12 12)"/>' },
        chevronDown: { strokeWidth: 2, body: '<path d="m6 9 6 6 6-6"/>' },
        check: { strokeWidth: 2.4, body: '<path d="M20 6 9 17l-5-5"/>' },
        chevronLeft: { strokeWidth: 2, body: '<path d="m15 18-6-6 6-6"/>' },
        chevronRight: { strokeWidth: 2, body: '<path d="m9 18 6-6-6-6"/>' },
        cloud: { strokeWidth: 2, body: '<path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9Z"/>' },
        mail: { strokeWidth: 2, body: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>' },
        file: { strokeWidth: 2, body: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>' },
        menu: { strokeWidth: 2, body: '<path d="M4 6h16M4 12h16M4 18h16"/>' },
        share: { strokeWidth: 2, body: '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/>' },
        download: { strokeWidth: 2, body: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>' },
        shield: { strokeWidth: 2, body: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>' },
        moreVertical: { strokeWidth: 2, body: '<circle cx="12" cy="5" r="1.8" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.8" fill="currentColor" stroke="none"/>' },
        sort: { strokeWidth: 2, body: '<path d="M8 16v-9M8 16l-3-3M8 16l3-3"/><path d="M16 8v9M16 8l3 3M16 8l-3 3"/>' },
        trash: { strokeWidth: 2, body: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>' },
        calendar: { strokeWidth: 2, body: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>' },
        person: { strokeWidth: 2, body: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>' },
        package: { strokeWidth: 2, body: '<path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>' },
        location: { strokeWidth: 2, body: '<path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/>' },
        receipt: { strokeWidth: 2, body: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 7h8M8 11h8M8 15h5"/>' },
        tag: { strokeWidth: 2, body: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r="1.5"/>' },
        undo: { strokeWidth: 2, body: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>' },
        printer: { strokeWidth: 2, body: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>' },
        history: { strokeWidth: 2, body: '<path d="M3 12a9 9 0 1 0 2.64-6.36"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>' }
      };
      const spec = paths[name];
      if (!spec) return '';
      const valign = -Math.round(size / 7);
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${spec.strokeWidth}" style="display:inline;vertical-align:${valign}px">${spec.body}</svg>`;
    },

    // Controla se a opção "vendido por peso (kg)" aparece no cadastro de produto.
    soldByWeightEnabled() {
      return window.APP_CONFIG?.features?.soldByWeight ?? true;
    },

    // Cor da borda lateral do card de pedido, de acordo com a forma de pagamento.
    paymentMethodAccentClass(method) {
      return { dinheiro: 'border-l-green-600', pix: 'border-l-blue-600', cartao: 'border-l-purple-600' }[method] ?? 'border-l-gray-400';
    },

    // Cor do texto de acordo com a forma de pagamento.
    paymentMethodTextClass(method) {
      return { dinheiro: 'text-green-700', pix: 'text-blue-700', cartao: 'text-purple-700' }[method] ?? 'text-gray-600';
    },

    // Cor do "selo" (pill) de forma de pagamento.
    paymentMethodPillClass(method) {
      return {
        dinheiro: 'bg-green-50 text-green-700',
        pix: 'bg-blue-50 text-blue-700',
        cartao: 'bg-purple-50 text-purple-700'
      }[method] ?? 'bg-gray-100 text-gray-700';
    },

    // Estilo do botão de forma de pagamento no formulário (destacado se for o selecionado).
    paymentButtonClass(method) {
      return this.paymentMethod === method ? this.paymentMethodPillClass(method) : 'bg-gray-100 text-gray-600';
    },

    // ===== CRUD do formulário de produto =====

    // Limpa o formulário de produto.
    resetProductForm() {
      this.productForm = {
        id: null, name: '', brand: '',
        soldByWeight: false, pricePerKg: null,
        priceDinheiro: null, pricePix: null, priceCartao: null
      };
      this.priceSyncPix = true;
      this.priceSyncCartao = true;
      this.productFormError = '';
    },

    // Abre o formulário zerado para cadastrar um produto novo.
    openNewProductForm() {
      this.resetProductForm();
      this.showProductForm = true;
    },

    // Abre o formulário já preenchido com os dados de um produto existente, para editar.
    startEditProduct(product) {
      this.productForm = {
        id: product.id,
        name: product.name,
        brand: product.brand,
        soldByWeight: product.soldByWeight ?? false,
        pricePerKg: product.pricePerKg ?? null,
        priceDinheiro: product.prices ? product.prices.dinheiro : null,
        pricePix: product.prices ? product.prices.pix : null,
        priceCartao: product.prices ? product.prices.cartao : null
      };
      this.priceSyncPix = product.prices ? product.prices.pix === product.prices.dinheiro : true;
      this.priceSyncCartao = product.prices ? product.prices.cartao === product.prices.dinheiro : true;
      this.productFormError = '';
      this.showProductForm = true;
    },

    // Ao digitar o preço em dinheiro: replica esse valor para Pix/Cartão também,
    // a menos que o usuário já tenha digitado um preço diferente para eles.
    onPriceDinheiroInput(value) {
      const num = value === '' ? null : Number(value);
      this.productForm.priceDinheiro = num;
      if (this.priceSyncPix) this.productForm.pricePix = num;
      if (this.priceSyncCartao) this.productForm.priceCartao = num;
    },

    // Preço específico do Pix (para de seguir o preço do dinheiro automaticamente).
    onPricePixInput(value) {
      this.productForm.pricePix = value === '' ? null : Number(value);
      this.priceSyncPix = false;
    },

    // Preço específico do Cartão (para de seguir o preço do dinheiro automaticamente).
    onPriceCartaoInput(value) {
      this.productForm.priceCartao = value === '' ? null : Number(value);
      this.priceSyncCartao = false;
    },

    // Fecha o formulário de produto sem salvar.
    closeProductForm() {
      this.resetProductForm();
      this.showProductForm = false;
    },

    // Valida (nome preenchido, preços válidos) e salva o produto — cria um novo
    // ou atualiza o que está em edição.
    async saveProductForm() {
      if (!this.productForm.name) {
        this.productFormError = 'Preencha o nome.';
        return;
      }

      if (this.productForm.soldByWeight) {
        if (typeof this.productForm.pricePerKg !== 'number' || !(this.productForm.pricePerKg > 0)) {
          this.productFormError = 'Informe o preço por kg.';
          return;
        }

        await saveProduct({
          id: this.productForm.id ?? undefined,
          name: this.productForm.name,
          brand: this.productForm.brand,
          soldByWeight: true,
          pricePerKg: this.productForm.pricePerKg
        });
      } else {
        const prices = {
          dinheiro: this.productForm.priceDinheiro,
          pix: this.productForm.pricePix,
          cartao: this.productForm.priceCartao
        };
        if (Object.values(prices).some(v => typeof v !== 'number' || !(v > 0))) {
          this.productFormError = 'Informe os 3 preços (maior que zero).';
          return;
        }

        await saveProduct({
          id: this.productForm.id ?? undefined,
          name: this.productForm.name,
          brand: this.productForm.brand,
          soldByWeight: false,
          prices
        });
      }

      this.products = await listProducts();
      this.closeProductForm();
    },

    // Quantidade de produtos ativos (exibida na lista de produtos).
    activeProductCount() {
      return this.products.filter(p => p.active).length;
    },

    // Lista de produtos filtrada pela busca por nome e pelo filtro ativos/todos.
    filteredProductList() {
      const query = this.normalizeSearchText(this.productSearch);
      return this.products
        .filter(p => this.productFilter === 'all' || p.active)
        .filter(p => !query || this.normalizeSearchText(this.productDisplayName(p)).includes(query));
    },

    // Ativa/desativa um produto (não some da tela de gerenciar, só some do novo pedido).
    async toggleProductActive(product) {
      await setProductActive(product.id, !product.active);
      this.products = await listProducts();
    }
  }));
});

// vendor/alpine.min.js is a plain (non-module) self-starting build: it calls
// Alpine.start() via queueMicrotask as soon as its own script body finishes
// executing. Its timing relative to a type="module" script is NOT reliably
// controlled by tag order in the document (confirmed empirically — module
// scripts and classic <script defer> scripts do not share a guaranteed
// relative execution order in Chromium). Loading it via dynamic import here,
// after the 'alpine:init' listener above has already been registered,
// guarantees Alpine.start() (and the 'alpine:init' event it fires) always
// runs after our Alpine.data('pedidosApp', ...) registration is in place.
import('../vendor/alpine.min.js');
