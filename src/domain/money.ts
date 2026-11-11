// El dinero del libro contable se maneja en centavos enteros para evitar errores de punto flotante.

export const toCents = (dollars: number) => Math.round(dollars * 100);

const usd = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" });
export const fmtCents = (cents: number) => usd.format(cents / 100);

/** Divide un pago entre proveedor y plataforma. La comisión se redondea al centavo. */
export function splitFee(amountCents: number, feeRate: number) {
  const fee = Math.round(amountCents * feeRate);
  return { fee, provider: amountCents - fee };
}

// Cuentas del libro (ver comentario del modelo LedgerEntry en schema.prisma).
export const ACCOUNTS = {
  WORLD: "WORLD",
  REVENUE: "REVENUE",
  escrow: (requestId: string) => `ESCROW:${requestId}`,
  available: (userId: string) => `AVAILABLE:${userId}`,
  payoutPending: (userId: string) => `PAYOUT_PENDING:${userId}`,
};

export const MIN_PAYOUT_CENTS = 1000; // $10
export const AUTO_RELEASE_HOURS = 72;
// Proveedores con menos trabajos completados esperan antes de poder retirar (protección ante contracargos/fraude).
export const NEW_PROVIDER_JOBS = 3;
export const NEW_PROVIDER_HOLD_DAYS = 7;
// Tras cambiar la cuenta bancaria, los retiros esperan (si alguien robó la sesión, el dueño alcanza a reaccionar).
export const BANK_CHANGE_HOLD_HOURS = 48;
