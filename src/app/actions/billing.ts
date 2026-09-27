"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { ADMIN_BLOCKED, isAdmin, requireUser } from "@/lib/auth";
import { BOOST_COSTS, BUMP_COOLDOWN_HOURS, CREDIT_PACKS, FEATURE_DAYS, PLANS, isFeatured, type PlanId } from "@/lib/constants";
import { InsufficientCredits, grantCredits, spendCredits, subscribe } from "@/lib/credits";
import { balance, post, type Tx } from "@/lib/ledger";
import { ACCOUNTS, toCents } from "@/lib/money";
import type { FormState } from "./auth";

// MVP: compras y suscripciones simuladas. En producción, estas acciones se ejecutan desde el
// webhook de la pasarela (PayPhone/Kushki) cuando el pago se confirma, nunca directo desde el cliente.

export type PayMethod = "CARD" | "BALANCE";

/**
 * Cobra con el saldo de la billetera (dinero ganado o reembolsado): el dinero no sale de la plataforma.
 * "CARD" sigue simulado hasta integrar la pasarela.
 */
async function chargeBalance(tx: Tx, userId: string, cents: number, memo: string) {
  if ((await balance(ACCOUNTS.available(userId), tx)) < cents) throw new InsufficientBalance();
  await post(
    tx,
    [
      { account: ACCOUNTS.available(userId), amountCents: -cents },
      { account: ACCOUNTS.REVENUE, amountCents: cents },
    ],
    memo,
    "PURCHASE",
    userId,
  );
}

class InsufficientBalance extends Error {
  constructor() {
    super("Tu saldo no alcanza. Usa otro método de pago.");
  }
}

export async function buyCredits(packId: string, method: PayMethod = "CARD"): Promise<FormState> {
  const user = await requireUser("/creditos");
  if (isAdmin(user)) return { error: ADMIN_BLOCKED };
  const pack = CREDIT_PACKS.find((p) => p.id === packId);
  if (!pack) return { error: "Paquete no válido" };
  const label = `Compra de ${pack.credits} créditos ($${pack.price.toFixed(2)})`;
  try {
    await db.$transaction(async (tx) => {
      if (method === "BALANCE") await chargeBalance(tx, user.id, toCents(pack.price), label);
      await grantCredits(tx, user.id, pack.credits, "PURCHASE", method === "BALANCE" ? `${label} con saldo` : label);
    });
  } catch (e) {
    if (e instanceof InsufficientBalance) return { error: e.message };
    throw e;
  }
  revalidatePath("/", "layout");
  return { ok: `¡Listo! Sumaste ${pack.credits} créditos.` };
}

export async function subscribePlan(planId: string, method: PayMethod = "CARD"): Promise<FormState> {
  const user = await requireUser("/planes");
  if (isAdmin(user)) return { error: ADMIN_BLOCKED };
  if (planId !== "PRO" && planId !== "ELITE") return { error: "Plan no válido" };
  const plan = PLANS[planId as PlanId];
  try {
    if (method === "BALANCE") {
      await db.$transaction((tx) => chargeBalance(tx, user.id, toCents(plan.price), `Plan ${plan.label} (1 mes)`));
    }
  } catch (e) {
    if (e instanceof InsufficientBalance) return { error: e.message };
    throw e;
  }
  await subscribe(user.id, planId as PlanId);
  revalidatePath("/", "layout");
  return { ok: `¡Bienvenido al plan ${plan.label}! Te sumamos ${plan.monthlyCredits} créditos.` };
}

export async function setAutoRenew(autoRenew: boolean) {
  const user = await requireUser("/planes");
  await db.user.update({ where: { id: user.id }, data: { planAutoRenew: autoRenew } });
  revalidatePath("/planes");
}

// ---------------------------------------------------------------------------
// Boosts de solicitudes (quien pide)

export type BoostKind = "FEATURE" | "URGENT" | "BUMP";

export async function boostRequest(requestId: string, kind: BoostKind): Promise<FormState> {
  const user = await requireUser();
  const request = await db.request.findUnique({ where: { id: requestId } });
  if (!request || request.authorId !== user.id) return { error: "No puedes modificar esta solicitud" };
  if (request.status !== "OPEN") return { error: "Solo puedes impulsar solicitudes abiertas" };

  const now = new Date();
  let data: { featuredUntil?: Date; urgent?: boolean; bumpedAt?: Date };
  let label: string;
  if (kind === "FEATURE") {
    const base = isFeatured(request) ? request.featuredUntil! : now;
    data = { featuredUntil: new Date(base.getTime() + FEATURE_DAYS * 86400_000) };
    label = `Destacar ${FEATURE_DAYS} días`;
  } else if (kind === "URGENT") {
    if (request.urgent) return { error: "Ya está marcada como urgente" };
    data = { urgent: true, bumpedAt: now };
    label = "Marcar como urgente";
  } else {
    const hours = (now.getTime() - request.bumpedAt.getTime()) / 3600_000;
    if (hours < BUMP_COOLDOWN_HOURS) {
      return { error: `Podrás volver a subirla en ${Math.ceil(BUMP_COOLDOWN_HOURS - hours)} h` };
    }
    data = { bumpedAt: now };
    label = "Volver a subir";
  }

  try {
    await db.$transaction(async (tx) => {
      await spendCredits(tx, user.id, BOOST_COSTS[kind], kind, `${label} · ${request.title}`);
      await tx.request.update({ where: { id: requestId }, data });
    });
  } catch (e) {
    if (e instanceof InsufficientCredits) return { error: e.message };
    throw e;
  }
  revalidatePath(`/solicitudes/${requestId}`);
  revalidatePath("/solicitudes");
  return { ok: "¡Listo! Tu solicitud ganó visibilidad." };
}
