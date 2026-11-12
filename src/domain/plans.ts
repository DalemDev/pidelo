// Planes de suscripción, paquetes de créditos y cotización de cambios de plan. Módulo puro.

export type PlanId = "FREE" | "PRO" | "ELITE";

export const PLANS: Record<
  PlanId,
  { id: PlanId; label: string; price: number; fee: number; monthlyCredits: number; earlyAccess: boolean; priority: number; perks: string[] }
> = {
  FREE: {
    id: "FREE",
    label: "Gratis",
    price: 0,
    fee: 0.1,
    monthlyCredits: 5,
    earlyAccess: false,
    priority: 0,
    perks: ["5 créditos gratis cada mes", "Comisión del 10 %", "Avisos de solicitudes de tus categorías"],
  },
  PRO: {
    id: "PRO",
    label: "Pro",
    price: 4.99,
    fee: 0.07,
    monthlyCredits: 30,
    earlyAccess: true,
    priority: 1,
    perks: [
      "30 créditos cada mes",
      "Comisión del 7 %",
      "Acceso anticipado: ves y ofertas 10 min antes",
      "Tus ofertas aparecen arriba",
      "Insignia Pro en tu perfil",
      "Plantilla de oferta reutilizable",
    ],
  },
  ELITE: {
    id: "ELITE",
    label: "Élite",
    price: 12.99,
    fee: 0.05,
    monthlyCredits: 80,
    earlyAccess: true,
    priority: 2,
    perks: [
      "80 créditos cada mes",
      "Comisión del 5 %",
      "Acceso anticipado + avisos urgentes primero",
      "Tus ofertas arriba y destacadas",
      "Insignia Élite en tu perfil",
      "Plantilla de oferta reutilizable",
      "Estadísticas: tasa de aceptación, tiempo de respuesta, ingresos",
    ],
  },
};

export function planOf(plan: string) {
  return PLANS[(plan in PLANS ? plan : "FREE") as PlanId];
}

// Minutos de ventaja que tienen Pro/Élite sobre el plan gratis en solicitudes nuevas.
export const EARLY_ACCESS_MINUTES = 10;

// 1 crédito ≈ $0.20; los paquetes grandes traen bonificación.
export const CREDIT_PACKS = [
  { id: "p10", credits: 10, price: 2, bonus: "" },
  { id: "p30", credits: 30, price: 5, bonus: "+20 %" },
  { id: "p75", credits: 75, price: 10, bonus: "+50 %" },
] as const;

export const PLAN_CYCLE_MS = 30 * 86400_000;

export type PlanQuote =
  | { kind: "SAME" }
  // Sin plan pagado vigente: ciclo nuevo de 30 días, precio y créditos completos.
  | { kind: "NEW"; chargeCents: number; credits: number; renewsAt: Date }
  // Subida a mitad de ciclo: se paga la diferencia por los días restantes; la renovación no cambia.
  | { kind: "UPGRADE"; chargeCents: number; credits: number; renewsAt: Date; daysLeft: number }
  // Bajada: no hay reembolso; el cambio se aplica al renovar.
  | { kind: "DOWNGRADE"; renewsAt: Date };

export function quotePlanChange(
  current: { plan: string; planRenewsAt: Date | null },
  target: PlanId,
  now = new Date(),
): PlanQuote {
  const from = planOf(current.plan);
  const to = PLANS[target];
  const active = from.id !== "FREE" && !!current.planRenewsAt && current.planRenewsAt > now;

  if (!active) {
    return { kind: "NEW", chargeCents: Math.round(to.price * 100), credits: to.monthlyCredits, renewsAt: new Date(now.getTime() + PLAN_CYCLE_MS) };
  }
  if (from.id === to.id) return { kind: "SAME" };

  const renewsAt = current.planRenewsAt!;
  if (to.priority < from.priority) return { kind: "DOWNGRADE", renewsAt };

  // Fracción del ciclo que queda (0–1). Se redondea al centavo y al crédito.
  const remaining = Math.min(1, Math.max(0, (renewsAt.getTime() - now.getTime()) / PLAN_CYCLE_MS));
  return {
    kind: "UPGRADE",
    chargeCents: Math.round((to.price - from.price) * 100 * remaining),
    credits: Math.round((to.monthlyCredits - from.monthlyCredits) * remaining),
    renewsAt,
    daysLeft: Math.ceil((renewsAt.getTime() - now.getTime()) / 86400_000),
  };
}
