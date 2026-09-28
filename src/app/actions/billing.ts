"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ADMIN_BLOCKED, isAdmin, requireUser } from "@/lib/auth";
import { BOOST_COSTS, BUMP_COOLDOWN_HOURS, CREDIT_PACKS, FEATURE_DAYS, PLANS, isFeatured, type PlanId } from "@/lib/constants";
import { InsufficientCredits, applyPlanChange, grantCredits, spendCredits } from "@/lib/credits";
import { quotePlanChange, type PlanQuote } from "@/lib/plans";
import { balance, post, type Tx } from "@/lib/ledger";
import { ACCOUNTS, fmtCents, toCents } from "@/lib/money";
import { notify } from "@/lib/matching";
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
  const target = planId as PlanId;
  const plan = PLANS[target];

  let quote: PlanQuote;
  try {
    // Todo en una transacción: el plan vigente se lee, se cotiza, se cobra y se aplica junto.
    // Si el cobro falla, el plan no cambia; si el cambio falla, el cobro se revierte.
    quote = await db.$transaction(async (tx) => {
      const current = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { plan: true, planRenewsAt: true } });
      const q = quotePlanChange(current, target);
      if (q.kind === "SAME") return q;
      if (method === "BALANCE" && (q.kind === "NEW" || q.kind === "UPGRADE") && q.chargeCents > 0) {
        const memo = q.kind === "UPGRADE" ? `Mejora a ${plan.label} (prorrateo de ${q.daysLeft} días)` : `Plan ${plan.label} (1 mes)`;
        await chargeBalance(tx, user.id, q.chargeCents, memo);
      }
      await applyPlanChange(tx, user.id, target, q);
      return q;
    });
  } catch (e) {
    if (e instanceof InsufficientBalance) return { error: e.message };
    throw e;
  }

  if (quote.kind === "SAME") return { error: "Ya tienes este plan" };

  // La tarjeta del plan cambia tras aplicar el cambio (y con ella el botón), así que el mensaje de
  // éxito se muestra a nivel de página vía la URL, y queda una notificación como comprobante.
  const detail =
    quote.kind === "NEW"
      ? `Suscripción a ${plan.label}: ${fmtCents(quote.chargeCents)} · +${quote.credits} créditos. Se renueva el ${fmtDate(quote.renewsAt)}.`
      : quote.kind === "UPGRADE"
        ? `Mejora a ${plan.label}: ${fmtCents(quote.chargeCents)} por ${quote.daysLeft} días restantes · +${quote.credits} créditos. Tu renovación sigue el ${fmtDate(quote.renewsAt)}.`
        : `Pasarás a ${plan.label} el ${fmtDate(quote.renewsAt)}. Hasta entonces conservas tu plan actual.`;
  await notify(user.id, quote.kind === "DOWNGRADE" ? "📅 Cambio de plan programado" : `✨ Plan ${plan.label} activo`, detail, "/planes");
  revalidatePath("/", "layout");
  const params = new URLSearchParams({ cambio: quote.kind.toLowerCase(), plan: target });
  if (quote.kind !== "DOWNGRADE") {
    params.set("monto", String(quote.chargeCents));
    params.set("creditos", String(quote.credits));
  }
  redirect(`/planes?${params}`);
}

export async function setAutoRenew(autoRenew: boolean) {
  const user = await requireUser("/planes");
  // Cancelar la renovación también anula una bajada programada: el plan simplemente termina.
  await db.user.update({ where: { id: user.id }, data: { planAutoRenew: autoRenew, ...(autoRenew ? {} : { nextPlan: null }) } });
  revalidatePath("/planes");
}

export async function cancelPlanChange() {
  const user = await requireUser("/planes");
  await db.user.update({ where: { id: user.id }, data: { nextPlan: null } });
  revalidatePath("/planes");
}

const fmtDate = (d: Date) => d.toLocaleDateString("es-EC", { day: "numeric", month: "long" });

// ---------------------------------------------------------------------------
// Boosts de solicitudes (quien pide)

export type BoostKind = "FEATURE" | "URGENT" | "BUMP";

export async function boostRequest(requestId: string, kind: BoostKind): Promise<FormState> {
  const user = await requireUser();
  const request = await db.request.findUnique({ where: { id: requestId } });
  if (!request || request.authorId !== user.id) return { error: "No puedes modificar esta solicitud" };
  if (request.status !== "OPEN") return { error: "Solo puedes impulsar solicitudes abiertas" };

  const now = new Date();
  let data: { featuredUntil?: Date; urgent?: boolean; bumpedAt?: Date; expiryWarned?: boolean };
  let label: string;
  if (kind === "FEATURE") {
    const base = isFeatured(request) ? request.featuredUntil! : now;
    data = { featuredUntil: new Date(base.getTime() + FEATURE_DAYS * 86400_000) };
    label = `Destacar ${FEATURE_DAYS} días`;
  } else if (kind === "URGENT") {
    if (request.urgent) return { error: "Ya está marcada como urgente" };
    data = { urgent: true, bumpedAt: now, expiryWarned: false };
    label = "Marcar como urgente";
  } else {
    const hours = (now.getTime() - request.bumpedAt.getTime()) / 3600_000;
    if (hours < BUMP_COOLDOWN_HOURS) {
      return { error: `Podrás volver a subirla en ${Math.ceil(BUMP_COOLDOWN_HOURS - hours)} h` };
    }
    data = { bumpedAt: now, expiryWarned: false };
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
