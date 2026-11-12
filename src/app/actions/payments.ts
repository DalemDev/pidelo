"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AmountCentsSchema, BankAccountSchema, DisputeSchema } from "@/domain/schemas";
import { requireUser } from "@/server/auth/session";
import { parseInput, runAction, runVoidAction, type FormState } from "@/server/http/action";
import { ValidationError } from "@/domain/errors";
import * as escrow from "@/server/services/escrow";
import * as payments from "@/server/services/payments";
import * as payouts from "@/server/services/payouts";

// Adaptadores de formulario → servicios de pago, pago retenido y retiros.

export async function selectOffer(offerId: string) {
  const actor = await requireUser();
  let target = "";
  await runVoidAction("selectOffer", async () => {
    const payment = await payments.selectOffer(actor, offerId);
    target = `/pagos/${payment.id}`;
  });
  if (target) redirect(target);
}

export async function cancelPayment(paymentId: string) {
  const actor = await requireUser();
  let target = "";
  await runVoidAction("cancelPayment", async () => {
    target = `/solicitudes/${await payments.cancelPayment(actor, paymentId)}`;
  });
  if (target) redirect(target);
  revalidatePath(`/pagos/${paymentId}`);
}

export async function submitReceipt(paymentId: string, _: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireUser();
  return runAction("submitReceipt", async () => {
    const file = formData.get("receipt");
    if (!(file instanceof File) || file.size === 0) throw new ValidationError("Sube la foto o el PDF del comprobante");
    await payments.submitReceipt(actor, paymentId, {
      method: String(formData.get("method") ?? ""),
      reference: String(formData.get("reference") ?? ""),
      file,
    });
    revalidatePath(`/pagos/${paymentId}`);
    return { ok: "Recibido. Verificaremos tu pago, normalmente en menos de 1 hora hábil." };
  });
}

export async function confirmCompletion(requestId: string) {
  const actor = await requireUser();
  await runVoidAction("confirmCompletion", () => escrow.confirmCompletion(actor, requestId));
  revalidatePath(`/solicitudes/${requestId}`);
}

export async function openDispute(requestId: string, _: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireUser();
  return runAction("openDispute", async () => {
    const reason = parseInput(DisputeSchema, formData.get("reason") ?? "");
    await escrow.openDispute(actor, requestId, reason);
    revalidatePath(`/solicitudes/${requestId}`);
    return { ok: "Disputa abierta. El pago quedó congelado y te contactaremos pronto." };
  });
}

export async function saveBankAccount(_: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireUser("/billetera");
  return runAction("saveBankAccount", async () => {
    await payouts.saveBankAccount(actor, parseInput(BankAccountSchema, Object.fromEntries(formData)));
    revalidatePath("/billetera");
    return { ok: "Cuenta guardada. Por seguridad, podrás retirar a esta cuenta en 48 h." };
  });
}

export async function requestPayout(_: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireUser("/billetera");
  return runAction("requestPayout", async () => {
    const cents = parseInput(AmountCentsSchema, formData.get("amount"));
    await payouts.requestPayout(actor, cents);
    revalidatePath("/billetera");
    return { ok: "Solicitud de retiro recibida. Lo transferimos en 1 a 2 días hábiles." };
  });
}
