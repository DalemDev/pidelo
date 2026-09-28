// Cotización de cambios de plan (módulo puro: lo usan la página de planes y el servidor).
import { PLANS, planOf, type PlanId } from "./constants";

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
