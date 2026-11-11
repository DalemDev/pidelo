import "server-only";

// Datos de cobro de la empresa. Configúralos en .env; los valores por defecto son de DEMOSTRACIÓN.
export const PAYMENT_INFO = {
  bank: process.env.PAY_BANK_NAME ?? "Banco Pichincha",
  accountType: process.env.PAY_ACCOUNT_TYPE ?? "Cuenta corriente",
  accountNumber: process.env.PAY_ACCOUNT_NUMBER ?? "0000000000 (demo)",
  holder: process.env.PAY_HOLDER ?? "Pídelo S.A.S. (demo)",
  ruc: process.env.PAY_RUC ?? "0000000000001 (demo)",
  deunaPhone: process.env.PAY_DEUNA ?? "09XXXXXXXX (demo)",
  isDemo: !process.env.PAY_ACCOUNT_NUMBER,
};
