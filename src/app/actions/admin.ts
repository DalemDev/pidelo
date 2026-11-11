"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/server/db/client";
import { requireUser } from "@/server/auth/session";
import { notify } from "@/server/services/matching";
import { EscrowError, confirmPayment, resolveDispute, type Resolution } from "@/server/services/escrow";
import { post } from "@/server/services/ledger";
import { ACCOUNTS, fmtCents, toCents } from "@/domain/money";
import type { FormState } from "./auth";

async function requireAdmin() {
  const user = await requireUser("/admin");
  if (user.role !== "ADMIN") redirect("/");
  return user;
}

function done(message: string): FormState {
  revalidatePath("/admin");
  return { ok: message };
}

async function guard(fn: () => Promise<void>, message: string): Promise<FormState> {
  try {
    await fn();
    return done(message);
  } catch (e) {
    if (e instanceof EscrowError) return { error: e.message };
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Pagos entrantes

export async function adminConfirmPayment(paymentId: string): Promise<FormState> {
  await requireAdmin();
  return guard(() => confirmPayment(paymentId), "Pago confirmado y retenido");
}

export async function adminRejectPayment(paymentId: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const note = String(formData.get("note") ?? "").trim();
  if (note.length < 5) return { error: "Explica al cliente qué está mal en el comprobante" };
  const payment = await db.payment.findUnique({ where: { id: paymentId }, include: { request: true } });
  if (!payment || payment.status !== "SUBMITTED") return { error: "Este pago no está por verificar" };
  await db.payment.update({ where: { id: paymentId }, data: { status: "REJECTED", adminNote: note } });
  await notify(payment.payerId, "⚠️ No pudimos verificar tu pago", note, `/pagos/${paymentId}`);
  return done("Comprobante rechazado; el cliente puede reenviarlo");
}

// ---------------------------------------------------------------------------
// Disputas

export async function adminResolveDispute(disputeId: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const resolution = String(formData.get("resolution")) as Resolution;
  if (!["REFUND", "RELEASE", "SPLIT"].includes(resolution)) return { error: "Elige una resolución" };
  const refundCents = resolution === "SPLIT" ? toCents(Number(formData.get("refund") ?? 0)) : 0;
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);
  return guard(() => resolveDispute(disputeId, resolution, refundCents, note), "Disputa resuelta");
}

// ---------------------------------------------------------------------------
// Retiros

export async function adminMarkPayoutPaid(payoutId: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const reference = String(formData.get("reference") ?? "").trim();
  if (reference.length < 4) return { error: "Ingresa el número de la transferencia" };
  const payout = await db.payout.findUnique({ where: { id: payoutId } });
  if (!payout) return { error: "Retiro no encontrado" };

  const result = await guard(
    () =>
      db.$transaction(async (tx) => {
        // Condicionado al estado: evita pagar dos veces si dos admins hacen clic a la vez.
        const { count } = await tx.payout.updateMany({
          where: { id: payoutId, status: "REQUESTED" },
          data: { status: "PAID", reference, processedAt: new Date() },
        });
        if (!count) throw new EscrowError("Este retiro ya fue procesado");
        await post(
          tx,
          [
            { account: ACCOUNTS.payoutPending(payout.userId), amountCents: -payout.amountCents },
            { account: ACCOUNTS.WORLD, amountCents: payout.amountCents },
          ],
          `Transferencia de retiro ${reference}`,
          "PAYOUT",
          payout.id,
        );
      }),
    "Retiro marcado como pagado",
  );
  if (result?.ok) {
    await notify(payout.userId, "🏦 Te transferimos tu retiro", `${fmtCents(payout.amountCents)} · comprobante ${reference}`, "/billetera");
  }
  return result;
}

export async function adminRejectPayout(payoutId: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const note = String(formData.get("note") ?? "").trim();
  if (note.length < 5) return { error: "Explica el motivo (p. ej. la cuenta no está a nombre del titular)" };
  const payout = await db.payout.findUnique({ where: { id: payoutId } });
  if (!payout) return { error: "Retiro no encontrado" };

  const result = await guard(
    () =>
      db.$transaction(async (tx) => {
        const { count } = await tx.payout.updateMany({
          where: { id: payoutId, status: "REQUESTED" },
          data: { status: "REJECTED", adminNote: note, processedAt: new Date() },
        });
        if (!count) throw new EscrowError("Este retiro ya fue procesado");
        // Asiento inverso: el dinero vuelve al saldo disponible.
        await post(
          tx,
          [
            { account: ACCOUNTS.payoutPending(payout.userId), amountCents: -payout.amountCents },
            { account: ACCOUNTS.available(payout.userId), amountCents: payout.amountCents },
          ],
          "Retiro rechazado: se devuelve al saldo",
          "PAYOUT",
          payout.id,
        );
      }),
    "Retiro rechazado y devuelto al saldo",
  );
  if (result?.ok) await notify(payout.userId, "⚠️ Retiro rechazado", `${note} · el dinero volvió a tu saldo`, "/billetera");
  return result;
}
