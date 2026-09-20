// Configurações do negócio — ajuste aqui sem precisar mexer no resto do código.
window.APP_CONFIG = {
  // Nome do negócio impresso no cabeçalho do recibo.
  businessName: 'Pedidos',
  // Título impresso no recibo de fechamento de caixa (ex.: "FECHAMENTO", "FECHAMENTO DO DIA").
  closingReceiptTitle: 'FECHAMENTO',
  features: {
    // Se true, habilita produtos vendidos por peso (kg) além de produtos com preço fixo.
    soldByWeight: true,
    // Depois de quantos dias sem backup o app avisa (ponto âmbar no menu ☰).
    backupReminderDays: 7,
    // Se true, mostra o menu de desenvolvedor (ex.: "Limpar dados") na barra de navegação.
    // Deve ficar `false` em uso normal do negócio — é só para testes/desenvolvimento.
    devMode: true
  }
};
