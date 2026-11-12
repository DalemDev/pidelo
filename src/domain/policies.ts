// Reglas de negocio con plazos, costos y umbrales. Módulo puro (sin acceso a datos).

// Los datos de contacto solo se desbloquean en el hilo de la oferta aceptada con el pago ya protegido.
export function contactUnlocked(request: { acceptedOfferId: string | null; escrow: string }, offerId: string) {
  return request.acceptedOfferId === offerId && ["HELD", "DISPUTED", "RELEASED"].includes(request.escrow);
}

// Anti-fuga: con 3 advertencias se pierde prioridad (sin match instantáneo, ofertas al final); con 5, suspensión.
export const STRIKES_LOSE_PRIORITY = 3;
export const STRIKES_SUSPEND = 5;

export const BOOST_COSTS = { FEATURE: 3, URGENT: 5, BUMP: 2 } as const;
export const FEATURE_DAYS = 3;
export const BUMP_COOLDOWN_HOURS = 24;

// Ofertar cuesta más en solicitudes de mayor presupuesto.
export function offerCost(budgetMin: number | null, budgetMax: number | null) {
  const budget = budgetMax ?? budgetMin;
  if (budget == null || budget < 20) return 1;
  if (budget < 100) return 2;
  return 3;
}

export function isFeatured(r: { featuredUntil: Date | null }) {
  return !!r.featuredUntil && r.featuredUntil > new Date();
}

// Una solicitud abierta sin actividad (sin elegir oferta ni volver a subirla) vence a los 14 días
// y devuelve los créditos a quienes ofertaron. El recordatorio sale 2 días antes.
export const REQUEST_EXPIRY_DAYS = 14;
export const EXPIRY_WARNING_DAYS = 2;

// Plazo para pagar una oferta elegida. Si vence sin comprobante, la oferta vuelve a competir y la
// solicitud se reabre: así ni el cliente ni el proveedor quedan trabados esperando un pago que no llega.
export const PAYMENT_DEADLINE_HOURS = 48;

/** Fecha límite de un pago pendiente: cuenta desde que se eligió la oferta o desde el último comprobante enviado. */
export function paymentDeadline(p: { createdAt: Date; submittedAt: Date | null }) {
  return new Date((p.submittedAt ?? p.createdAt).getTime() + PAYMENT_DEADLINE_HOURS * 3600_000);
}

export function expiresAt(r: { bumpedAt: Date }) {
  return new Date(r.bumpedAt.getTime() + REQUEST_EXPIRY_DAYS * 86400_000);
}

// Suspensión por intentos repetidos de sacar contactos o pagos de la plataforma.
export const SUSPENSION_DAYS = 7;

export function isSuspended(user: { suspendedUntil: Date | null }, now = new Date()) {
  return !!user.suspendedUntil && user.suspendedUntil > now;
}

export function suspendedMessage(until: Date) {
  return `Tu cuenta está suspendida hasta el ${until.toLocaleDateString("es-EC", { day: "numeric", month: "long", timeZone: "America/Guayaquil" })} por intentar sacar pagos o contactos de la plataforma.`;
}
