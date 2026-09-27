import "server-only";
import { db } from "./db";
import { PLANS, planOf, type PlanId } from "./constants";

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export class InsufficientCredits extends Error {
  constructor(
    public needed: number,
    public balance: number,
  ) {
    super(`Necesitas ${needed} crédito${needed === 1 ? "" : "s"} y tienes ${balance}.`);
  }
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
    select: { plan: true, planRenewsAt: true, planAutoRenew: true, creditsGrantedAt: true, role: true },
  });
  if (!user || user.role === "ADMIN") return;
  const now = new Date();

  if (user.plan !== "FREE" && user.planRenewsAt && user.planRenewsAt <= now) {
    if (user.planAutoRenew) {
      // MVP: renovación simulada. En producción aquí se confirma el cobro recurrente de la pasarela.
      const plan = planOf(user.plan);
      await db.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: { planRenewsAt: new Date(user.planRenewsAt!.getTime() + MONTH_MS), creditsGrantedAt: now },
        });
        await grantCredits(tx, userId, plan.monthlyCredits, "PLAN", `Renovación plan ${plan.label}`);
      });
    } else {
      await db.user.update({ where: { id: userId }, data: { plan: "FREE", planRenewsAt: null } });
    }
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

export async function subscribe(userId: string, planId: PlanId) {
  const plan = PLANS[planId];
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { plan: planId, planRenewsAt: new Date(now.getTime() + MONTH_MS), planAutoRenew: true, creditsGrantedAt: now },
    });
    await grantCredits(tx, userId, plan.monthlyCredits, "PLAN", `Suscripción plan ${plan.label}`);
  });
}
