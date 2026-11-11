"use server";

import { revalidatePath } from "next/cache";
import { AmountCentsSchema } from "@/domain/schemas";
import { requireAdmin } from "@/server/auth/session";
import { parseInput, runAction, type FormState } from "@/server/http/action";
import * as escrow from "@/server/services/escrow";
import * as payouts from "@/server/services/payouts";

// Acciones del panel de administración. Cada servicio vuelve a verificar el rol y deja registro de auditoría.

async function adminAction(name: string, fn: () => Promise<void>, message: string): Promise<FormState> {
  return runAction(name, async () => {
    await fn();
    revalidatePath("/admin");
    return { ok: message };
  });
}

export async function adminConfirmPayment(paymentId: string): Promise<FormState> {
  const actor = await requireAdmin();
  return adminAction("adminConfirmPayment", () => escrow.confirmPayment(actor, paymentId), "Pago confirmado y retenido");
}

export async function adminRejectPayment(paymentId: string, _: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAdmin();
  const note = String(formData.get("note") ?? "").trim();
  return adminAction("adminRejectPayment", () => escrow.rejectPayment(actor, paymentId, note), "Comprobante rechazado; el cliente puede reenviarlo");
}

export async function adminResolveDispute(disputeId: string, _: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAdmin();
  const resolution = String(formData.get("resolution")) as escrow.Resolution;
  const note = String(formData.get("note") ?? "").trim();
  return adminAction(
    "adminResolveDispute",
    async () => {
      const refundCents = resolution === "SPLIT" ? parseInput(AmountCentsSchema, formData.get("refund") ?? 0) : 0;
      await escrow.resolveDispute(actor, disputeId, resolution, refundCents, note);
    },
    "Disputa resuelta",
  );
}

export async function adminMarkPayoutPaid(payoutId: string, _: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAdmin();
  const reference = String(formData.get("reference") ?? "").trim();
  return adminAction("adminMarkPayoutPaid", () => payouts.markPayoutPaid(actor, payoutId, reference), "Retiro marcado como pagado");
}

export async function adminRejectPayout(payoutId: string, _: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAdmin();
  const note = String(formData.get("note") ?? "").trim();
  return adminAction("adminRejectPayout", () => payouts.rejectPayout(actor, payoutId, note), "Retiro rechazado y devuelto al saldo");
}
