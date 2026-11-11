import "server-only";

// Datos de cobro de la empresa (variables PAY_*). En producción son obligatorios (ver assertProductionEnv);
// en desarrollo se muestran marcadores para que sea evidente qué falta configurar.
const placeholder = (name: string) => `[configurar ${name}]`;

export const PAYMENT_INFO = {
  bank: process.env.PAY_BANK_NAME ?? placeholder("PAY_BANK_NAME"),
  accountType: process.env.PAY_ACCOUNT_TYPE ?? placeholder("PAY_ACCOUNT_TYPE"),
  accountNumber: process.env.PAY_ACCOUNT_NUMBER ?? placeholder("PAY_ACCOUNT_NUMBER"),
  holder: process.env.PAY_HOLDER ?? placeholder("PAY_HOLDER"),
  ruc: process.env.PAY_RUC ?? placeholder("PAY_RUC"),
  deunaPhone: process.env.PAY_DEUNA ?? placeholder("PAY_DEUNA"),
};
