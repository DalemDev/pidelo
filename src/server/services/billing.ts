import "server-only";
import { PaymentError, ValidationError } from "@/domain/errors";
import { toCents } from "@/domain/money";
import { CREDIT_PACKS, PLANS, PLAN_CYCLE_MS, planOf, quotePlanChange, type PlanId, type PlanQuote } from "@/domain/plans";
import { assertMember } from "@/server/auth/guards";
import type { Actor } from "@/server/auth/session";
import { simulatedPaymentsEnabled } from "@/server/config/env";
import { db } from "@/server/db/client";
import type { Tx } from "@/server/db/client";
import { chargeBalance, grantCredits, tryChargeBalance } from "./credits";
import { lockAccount } from "./ledger";
import { notify } from "./notifications";

// Compras de créditos y suscripciones. "BALANCE" cobra del saldo de la billetera. "CARD" queda simulado
// hasta integrar la pasarela (PayPhone/Kushki): solo funciona en desarrollo. En producción, la compra con
// tarjeta debe confirmarse desde el webhook de la pasarela, nunca directo desde el cliente.

export type PayMethod = "CARD" | "BALANCE";

function assertMethod(method: string): asserts method is PayMethod {
  if (method !== "CARD" && method !== "BALANCE") throw new ValidationError("Método de pago no válido");
  if (method === "CARD" && !simulatedPaymentsEnabled()) {
    throw new PaymentError("El pago con tarjeta aún no está disponible. Puedes pagar con el saldo de tu billetera.");
  }
}

export async function buyCredits(actor: Actor, packId: string, method: string) {
  assertMember(actor);
  const pack = CREDIT_PACKS.find((p) => p.id === packId);
  if (!pack) throw new ValidationError("Paquete no válido");
  assertMethod(method);

  const label = `Compra de ${pack.credits} créditos ($${pack.price.toFixed(2)})`;
  await db.$transaction(async (tx) => {
    if (method === "BALANCE") await chargeBalance(tx, actor.id, toCents(pack.price), label);
    await grantCredits(tx, actor.id, pack.credits, "PURCHASE", method === "BALANCE" ? `${label} con saldo` : label);
  });
  return pack;
}

/** Aplica un cambio de plan ya cotizado, en la misma transacción que el cobro. */
async function applyPlanChange(tx: Tx, userId: string, target: PlanId, quote: PlanQuote) {
  const plan = PLANS[target];
  switch (quote.kind) {
    case "NEW":
      await tx.user.update({
        where: { id: userId },
        data: { plan: target, nextPlan: null, planRenewsAt: quote.renewsAt, planAutoRenew: true, creditsGrantedAt: new Date() },
      });
      await grantCredits(tx, userId, quote.credits, "PLAN", `Suscripción plan ${plan.label}`);
      return;
    case "UPGRADE":
      await tx.user.update({ where: { id: userId }, data: { plan: target, nextPlan: null, planAutoRenew: true } });
      await grantCredits(tx, userId, quote.credits, "PLAN", `Mejora a ${plan.label} (prorrateo de ${quote.daysLeft} días)`);
      return;
    case "DOWNGRADE":
      await tx.user.update({ where: { id: userId }, data: { nextPlan: target, planAutoRenew: true } });
      return;
    case "SAME":
      return;
  }
}

const fmtDate = (d: Date) => d.toLocaleDateString("es-EC", { day: "numeric", month: "long", timeZone: "America/Guayaquil" });

export async function subscribePlan(actor: Actor, planId: string, method: string) {
  assertMember(actor);
  if (planId !== "PRO" && planId !== "ELITE") throw new ValidationError("Plan no válido");
  if (method !== "CARD" && method !== "BALANCE") throw new ValidationError("Método de pago no válido");
  const target: PlanId = planId;
  const plan = PLANS[target];

  // Todo en una transacción: el plan vigente se lee, se cotiza, se cobra y se aplica junto.
  const quote = await db.$transaction(async (tx) => {
    // Serializa cambios de plan del mismo usuario: dos clics no cobran dos veces.
    await lockAccount(tx, `PLAN:${actor.id}`);
    const current = await tx.user.findUniqueOrThrow({ where: { id: actor.id }, select: { plan: true, planRenewsAt: true } });
    const q = quotePlanChange(current, target);
    if (q.kind === "SAME") return q;
    if ((q.kind === "NEW" || q.kind === "UPGRADE") && q.chargeCents > 0) {
      // Una bajada no cobra nada, así que solo se valida el método cuando hay cargo.
      assertMethod(method);
      if (method === "BALANCE") {
        const memo = q.kind === "UPGRADE" ? `Mejora a ${plan.label} (prorrateo de ${q.daysLeft} días)` : `Plan ${plan.label} (1 mes)`;
        await chargeBalance(tx, actor.id, q.chargeCents, memo);
      }
    }
    await applyPlanChange(tx, actor.id, target, q);
    return q;
  });
  if (quote.kind === "SAME") throw new ValidationError("Ya tienes este plan");

  const detail =
    quote.kind === "NEW"
      ? `Suscripción a ${plan.label}. Se renueva el ${fmtDate(quote.renewsAt)}.`
      : quote.kind === "UPGRADE"
        ? `Mejora a ${plan.label} por ${quote.daysLeft} días restantes. Tu renovación sigue el ${fmtDate(quote.renewsAt)}.`
        : `Pasarás a ${plan.label} el ${fmtDate(quote.renewsAt)}. Hasta entonces conservas tu plan actual.`;
  await notify(actor.id, quote.kind === "DOWNGRADE" ? "Cambio de plan programado" : `Plan ${plan.label} activo`, detail, "/planes");
  return quote;
}

export async function setAutoRenew(actor: Actor, autoRenew: boolean) {
  // Cancelar la renovación también anula una bajada programada: el plan simplemente termina.
  await db.user.update({ where: { id: actor.id }, data: { planAutoRenew: autoRenew, ...(autoRenew ? {} : { nextPlan: null }) } });
}

export async function cancelPlanChange(actor: Actor) {
  await db.user.update({ where: { id: actor.id }, data: { nextPlan: null } });
}

/**
 * Mantiene la cuenta al día: renueva o vence planes y entrega los créditos mensuales del plan gratis.
 * Se llama en cada render del navbar (barato: casi siempre no hace nada). Las actualizaciones están
 * condicionadas al valor leído, así que dos requests simultáneos no renuevan dos veces.
 */
export async function refreshAccount(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { plan: true, planRenewsAt: true, planAutoRenew: true, nextPlan: true, creditsGrantedAt: true, role: true },
  });
  if (!user || user.role === "ADMIN") return;
  const now = new Date();

  if (user.plan !== "FREE" && user.planRenewsAt && user.planRenewsAt <= now) {
    const renewsAt = user.planRenewsAt;
    await db.$transaction(async (tx) => {
      if (!user.planAutoRenew) {
        await tx.user.updateMany({ where: { id: userId, planRenewsAt: renewsAt }, data: { plan: "FREE", nextPlan: null, planRenewsAt: null } });
        return;
      }
      // Si había una bajada programada, se aplica ahora.
      const plan = planOf(user.nextPlan ?? user.plan);
      const { count } = await tx.user.updateMany({
        where: { id: userId, planRenewsAt: renewsAt },
        data: { plan: plan.id, nextPlan: null, planRenewsAt: new Date(renewsAt.getTime() + PLAN_CYCLE_MS), creditsGrantedAt: now },
      });
      if (!count) return;
      // Sin pasarela, la renovación se cobra del saldo de la billetera (en desarrollo sigue simulada).
      const paid = simulatedPaymentsEnabled() || (await tryChargeBalance(tx, userId, toCents(plan.price), `Renovación plan ${plan.label}`));
      if (paid) {
        await grantCredits(tx, userId, plan.monthlyCredits, "PLAN", `Renovación plan ${plan.label}`);
        return;
      }
      await tx.user.update({ where: { id: userId }, data: { plan: "FREE", nextPlan: null, planRenewsAt: null } });
      await notify(
        userId,
        `Tu plan ${plan.label} terminó`,
        "Tu saldo no alcanzó para renovarlo. Puedes volver a suscribirte cuando quieras.",
        "/planes",
        tx,
      );
    });
    return;
  }

  if (user.plan === "FREE" && (!user.creditsGrantedAt || now.getTime() - user.creditsGrantedAt.getTime() >= PLAN_CYCLE_MS)) {
    await db.$transaction(async (tx) => {
      const { count } = await tx.user.updateMany({
        where: {
          id: userId,
          OR: [{ creditsGrantedAt: null }, { creditsGrantedAt: { lte: new Date(now.getTime() - PLAN_CYCLE_MS) } }],
        },
        data: { creditsGrantedAt: now },
      });
      if (count) await grantCredits(tx, userId, PLANS.FREE.monthlyCredits, "MONTHLY", "Créditos del mes");
    });
  }
}
