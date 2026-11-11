"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db/client";
import { ADMIN_BLOCKED, isAdmin, requireUser } from "@/server/auth/session";
import { planOf } from "@/domain/plans";
import { notify } from "@/server/services/matching";
import { EscrowError, notifyAdmins, paymentCode, releaseEscrow, walletSummary } from "@/server/services/escrow";
import { lockAccount, post } from "@/server/services/ledger";
import { ACCOUNTS, MIN_PAYOUT_CENTS, fmtCents, toCents } from "@/domain/money";
import { UploadError, saveReceipt } from "@/server/infra/storage";
import type { FormState } from "./auth";

// ---------------------------------------------------------------------------
// Elegir oferta → pagar

export async function selectOffer(offerId: string) {
  const user = await requireUser();
  const offer = await db.offer.findUnique({
    where: { id: offerId },
    include: { request: true, provider: { select: { plan: true } } },
  });
  if (!offer || offer.request.authorId !== user.id) return;
  if (offer.request.status !== "OPEN" || offer.status !== "PENDING") return;

  const payment = await db.$transaction(async (tx) => {
    // Condición en el where: si dos pestañas eligen a la vez, solo una gana.
    const { count } = await tx.request.updateMany({
      where: { id: offer.requestId, status: "OPEN" },
      data: { status: "AWAITING_PAYMENT", escrow: "PENDING", acceptedOfferId: offerId },
    });
    if (!count) return null;
    // La comisión se congela aquí, según el plan del proveedor en este momento.
    await tx.offer.update({ where: { id: offerId }, data: { status: "ACCEPTED", feeRate: planOf(offer.provider.plan).fee } });
    return tx.payment.create({
      data: {
        code: paymentCode(),
        amountCents: toCents(offer.price),
        requestId: offer.requestId,
        offerId,
        payerId: user.id,
      },
    });
  });
  if (!payment) return;

  await notify(
    offer.providerId,
    "🎯 ¡Te eligieron! Esperando el pago",
    `${offer.request.title} · te avisamos cuando el pago quede protegido. Aún no empieces.`,
    `/solicitudes/${offer.requestId}`,
  );
  redirect(`/pagos/${payment.id}`);
}

/** El cliente se arrepiente antes de pagar: vuelve a recibir ofertas. */
export async function cancelPayment(paymentId: string) {
  const user = await requireUser();
  const payment = await db.payment.findUnique({ where: { id: paymentId }, include: { request: true } });
  if (!payment || payment.payerId !== user.id) return;
  if (payment.status !== "PENDING" && payment.status !== "REJECTED") return;

  await db.$transaction([
    db.payment.update({ where: { id: paymentId }, data: { status: "CANCELLED" } }),
    db.offer.update({ where: { id: payment.offerId }, data: { status: "PENDING" } }),
    db.request.update({
      where: { id: payment.requestId },
      data: { status: "OPEN", escrow: "NONE", acceptedOfferId: null },
    }),
  ]);
  const offer = await db.offer.findUniqueOrThrow({ where: { id: payment.offerId } });
  await notify(offer.providerId, "↩️ El cliente reconsideró su elección", `Tu oferta sigue activa · ${payment.request.title}`, `/solicitudes/${payment.requestId}`);
  redirect(`/solicitudes/${payment.requestId}`);
}

export async function submitReceipt(paymentId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const payment = await db.payment.findUnique({ where: { id: paymentId }, include: { request: true } });
  if (!payment || payment.payerId !== user.id) return { error: "Pago no encontrado" };
  if (payment.status !== "PENDING" && payment.status !== "REJECTED") return { error: "Este pago ya fue enviado" };

  const method = formData.get("method") === "DEUNA" ? "DEUNA" : "TRANSFER";
  const reference = String(formData.get("reference") ?? "").trim().slice(0, 100);
  const file = formData.get("receipt");
  const hasFile = file instanceof File && file.size > 0;
  if (!hasFile) return { error: "Sube la foto o el PDF del comprobante" };

  let receiptPath: string;
  try {
    receiptPath = await saveReceipt(file, payment.id);
  } catch (e) {
    if (e instanceof UploadError) return { error: e.message };
    throw e;
  }

  // Condicionado al estado: si el plazo de pago venció mientras se subía el archivo, no se reactiva.
  const { count } = await db.payment.updateMany({
    where: { id: paymentId, status: { in: ["PENDING", "REJECTED"] }, request: { status: "AWAITING_PAYMENT" } },
    data: { method, reference, receiptPath, status: "SUBMITTED", submittedAt: new Date(), adminNote: "" },
  });
  if (!count) return { error: "Este pago ya no está pendiente. Revisa el estado de tu solicitud." };
  await notifyAdmins("🧾 Comprobante por verificar", `${payment.code} · ${fmtCents(payment.amountCents)} · ${payment.request.title}`, "/admin");
  revalidatePath(`/pagos/${paymentId}`);
  return { ok: "¡Recibido! Verificaremos tu pago (normalmente en menos de 1 hora hábil)." };
}

// ---------------------------------------------------------------------------
// Entrega y liberación

export async function confirmCompletion(requestId: string) {
  const user = await requireUser();
  const request = await db.request.findUnique({ where: { id: requestId } });
  if (!request || request.authorId !== user.id) return;
  try {
    await releaseEscrow(requestId, "CONFIRMED");
  } catch (e) {
    if (!(e instanceof EscrowError)) throw e;
  }
  revalidatePath(`/solicitudes/${requestId}`);
}

export async function openDispute(requestId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 20) return { error: "Cuéntanos qué pasó (al menos 20 caracteres)" };

  const request = await db.request.findUnique({ where: { id: requestId }, include: { acceptedOffer: true } });
  if (!request?.acceptedOffer) return { error: "Solicitud no encontrada" };
  const participants = [request.authorId, request.acceptedOffer.providerId];
  if (!participants.includes(user.id)) return { error: "No participas en este trabajo" };

  // Congela el dinero: ni el cliente puede liberar ni corre la liberación automática.
  const { count } = await db.request.updateMany({
    where: { id: requestId, escrow: "HELD", status: { in: ["IN_PROGRESS", "DELIVERED"] } },
    data: { escrow: "DISPUTED" },
  });
  if (!count) return { error: "Ya no se puede abrir una disputa para este trabajo" };
  await db.dispute.create({ data: { requestId, openedById: user.id, reason: reason.slice(0, 2000) } });

  const other = participants.find((p) => p !== user.id)!;
  await notify(other, "⚖️ Se abrió una disputa", `El pago queda congelado hasta que el equipo de Pídelo lo revise · ${request.title}`, `/solicitudes/${requestId}`);
  await notifyAdmins("⚖️ Nueva disputa", `${request.title} · ${reason.slice(0, 100)}`, "/admin");
  revalidatePath(`/solicitudes/${requestId}`);
  return { ok: "Disputa abierta. El pago quedó congelado y te contactaremos pronto." };
}

// ---------------------------------------------------------------------------
// Billetera: cuenta bancaria y retiros

const BankSchema = z.object({
  bankName: z.string().trim().min(3, "Indica el banco").max(60),
  bankAccountType: z.enum(["AHORROS", "CORRIENTE"]),
  bankAccountNumber: z.string().trim().regex(/^\d{6,20}$/, "El número de cuenta debe tener solo dígitos"),
  bankHolderName: z.string().trim().min(3, "Indica el titular").max(80),
  bankHolderId: z.string().trim().regex(/^\d{10}(\d{3})?$/, "Cédula (10 dígitos) o RUC (13 dígitos)"),
});

export async function saveBankAccount(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/billetera");
  if (isAdmin(user)) return { error: ADMIN_BLOCKED };
  const parsed = BankSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  await db.user.update({ where: { id: user.id }, data: parsed.data });
  revalidatePath("/billetera");
  return { ok: "Cuenta guardada" };
}

export async function requestPayout(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/billetera");
  if (isAdmin(user)) return { error: ADMIN_BLOCKED };
  const cents = toCents(Number(formData.get("amount")));
  if (!Number.isFinite(cents) || cents < MIN_PAYOUT_CENTS) return { error: `El retiro mínimo es ${fmtCents(MIN_PAYOUT_CENTS)}` };

  const bank = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { bankName: true, bankAccountType: true, bankAccountNumber: true, bankHolderName: true, bankHolderId: true },
  });
  if (!bank.bankAccountNumber) return { error: "Primero registra tu cuenta bancaria" };

  try {
    await db.$transaction(async (tx) => {
      // Con la cuenta bloqueada, un segundo retiro simultáneo espera y ve el saldo ya descontado.
      // walletSummary lee fuera de la transacción, pero ya incluye lo que confirmaron los retiros anteriores.
      await lockAccount(tx, ACCOUNTS.available(user.id));
      const wallet = await walletSummary(user.id);
      if (cents > wallet.withdrawable) throw new EscrowError(`Puedes retirar hasta ${fmtCents(wallet.withdrawable)}`);
      const payout = await tx.payout.create({ data: { userId: user.id, amountCents: cents, bankSnapshot: JSON.stringify(bank) } });
      await post(
        tx,
        [
          { account: ACCOUNTS.available(user.id), amountCents: -cents },
          { account: ACCOUNTS.payoutPending(user.id), amountCents: cents },
        ],
        "Retiro solicitado",
        "PAYOUT",
        payout.id,
      );
    });
  } catch (e) {
    if (e instanceof EscrowError) return { error: e.message };
    throw e;
  }
  await notifyAdmins("🏦 Retiro solicitado", `${user.name} · ${fmtCents(cents)}`, "/admin");
  revalidatePath("/billetera");
  return { ok: `Solicitaste ${fmtCents(cents)}. Lo transferimos en 1 a 2 días hábiles.` };
}
