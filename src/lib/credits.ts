import "server-only";
import { db } from "./db";
import { PLANS, planOf, type PlanId } from "./constants";
import type { PlanQuote } from "./plans";
import { simulatedPaymentsEnabled } from "./env";
import { balance, lockAccount, post } from "./ledger";
import { ACCOUNTS, toCents } from "./money";

export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export class InsufficientCredits extends Error {
  constructor(
    public needed: number,
    public balance: number,
  ) {
    super(`Necesitas ${needed} crédito${needed === 1 ? "" : "s"} y tienes ${balance}.`);
  }
}

export class InsufficientBalance extends Error {
  constructor() {
    super("Tu saldo no alcanza. Usa otro método de pago.");
  }
}

/**
 * Cobra con el saldo de la billetera (dinero ganado o reembolsado): el dinero no sale de la plataforma.
 * Devuelve false si el saldo no alcanza. Bloquea la cuenta para que dos cobros simultáneos no sobregiren.
 */
export async function tryChargeBalance(tx: Tx, userId: string, cents: number, memo: string) {
  const account = ACCOUNTS.available(userId);
  await lockAccount(tx, account);
  if ((await balance(account, tx)) < cents) return false;
  await post(
    tx,
    [
      { account, amountCents: -cents },
      { account: ACCOUNTS.REVENUE, amountCents: cents },
    ],
    memo,
    "PURCHASE",
    userId,
  );
  return true;
}

export async function chargeBalance(tx: Tx, userId: string, cents: number, memo: string) {
  if (!(await tryChargeBalance(tx, userId, cents, memo))) throw new InsufficientBalance();
}

/** Descuenta créditos de forma atómica: nunca deja el saldo en negativo aunque haya requests simultáneos. */
export async function spendCredits(tx: Tx, userId: string, amount: number, reason: string, description: string) {
  const { count } = await tx.user.updateMany({
    where: { id: userId, credits: { gte: amount } },
    data: { credits: { decrement: amount } },
  });
  if (count === 0) {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { credits: true } });
    throw new InsufficientCredits(amount, user.credits);
  }
  await tx.creditTransaction.create({ data: { userId, amount: -amount, reason, description } });
}

export async function grantCredits(tx: Tx, userId: string, amount: number, reason: string, description: string) {
  await tx.user.update({ where: { id: userId }, data: { credits: { increment: amount } } });
  await tx.creditTransaction.create({ data: { userId, amount, reason, description } });
}

const MONTH_MS = 30 * 86400_000;

/**
 * Mantiene la cuenta al día sin cron: renueva o vence planes y entrega los créditos mensuales.
 * Se llama en cada render del navbar (barato: casi siempre no hace nada).
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
      // Condicionado a la fecha leída: si dos requests llegan a la vez, solo una renueva.
      if (user.planAutoRenew) {
        // Si había una bajada programada, se aplica ahora.
        const plan = planOf(user.nextPlan ?? user.plan);
        const { count } = await tx.user.updateMany({
          where: { id: userId, planRenewsAt: renewsAt },
          data: { plan: plan.id, nextPlan: null, planRenewsAt: new Date(renewsAt.getTime() + MONTH_MS), creditsGrantedAt: now },
        });
        if (!count) return;
        // Sin pasarela, la renovación se cobra del saldo de la billetera (en desarrollo sigue simulada).
        // Cuando exista cobro recurrente, aquí se confirma el cargo de la pasarela.
        const paid =
          simulatedPaymentsEnabled() || (await tryChargeBalance(tx, userId, toCents(plan.price), `Renovación plan ${plan.label}`));
        if (paid) {
          await grantCredits(tx, userId, plan.monthlyCredits, "PLAN", `Renovación plan ${plan.label}`);
        } else {
          await tx.user.update({ where: { id: userId }, data: { plan: "FREE", nextPlan: null, planRenewsAt: null } });
          await tx.notification.create({
            data: {
              userId,
              title: `⌛ Tu plan ${plan.label} terminó`,
              body: "Tu saldo no alcanzó para renovarlo. Puedes volver a suscribirte cuando quieras.",
              link: "/planes",
            },
          });
        }
      } else {
        await tx.user.updateMany({ where: { id: userId, planRenewsAt: renewsAt }, data: { plan: "FREE", nextPlan: null, planRenewsAt: null } });
      }
    });
    return;
  }

  if (user.plan === "FREE" && (!user.creditsGrantedAt || now.getTime() - user.creditsGrantedAt.getTime() >= MONTH_MS)) {
    await db.$transaction(async (tx) => {
      // Condición en el where: evita doble entrega si dos requests llegan a la vez.
      const { count } = await tx.user.updateMany({
        where: {
          id: userId,
          OR: [{ creditsGrantedAt: null }, { creditsGrantedAt: { lte: new Date(now.getTime() - MONTH_MS) } }],
        },
        data: { creditsGrantedAt: now },
      });
      if (count) await grantCredits(tx, userId, PLANS.FREE.monthlyCredits, "MONTHLY", "Créditos gratis del mes");
    });
  }
}

/**
 * Aplica un cambio de plan ya cotizado (ver quotePlanChange). Debe correr dentro de la misma
 * transacción que el cobro, para que nunca haya cobro sin plan ni plan sin cobro.
 */
export async function applyPlanChange(tx: Tx, userId: string, target: PlanId, quote: PlanQuote) {
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
      if (quote.credits > 0) {
        await grantCredits(tx, userId, quote.credits, "PLAN", `Mejora a ${plan.label} (prorrateo de ${quote.daysLeft} días)`);
      }
      return;
    case "DOWNGRADE":
      await tx.user.update({ where: { id: userId }, data: { nextPlan: target, planAutoRenew: true } });
      return;
    case "SAME":
      return;
  }
}
