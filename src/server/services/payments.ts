import "server-only";
import { randomBytes } from "node:crypto";
import { ConflictError, ForbiddenError, NotFoundError } from "@/domain/errors";
import { fmtCents, toCents } from "@/domain/money";
import { planOf } from "@/domain/plans";
import { assertMember } from "@/server/auth/guards";
import type { Actor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { saveReceipt } from "@/server/infra/storage";
import { notify, notifyAdmins } from "./notifications";

// Cobro al cliente (fase 1: transferencia o DeUna con comprobante que verifica un administrador).
// Al integrar una pasarela, su webhook confirmará el pago con confirmPayment (services/escrow.ts).

// Código corto y legible para la descripción de la transferencia (sin 0/O/1/I para evitar confusiones).
function paymentCode() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  return "PID-" + [...randomBytes(6)].map((b) => alphabet[b % alphabet.length]).join("");
}

/** El cliente elige una oferta: la solicitud queda esperando su pago. Devuelve el pago creado. */
export async function selectOffer(actor: Actor, offerId: string) {
  assertMember(actor);
  const offer = await db.offer.findUnique({
    where: { id: offerId },
    include: { request: true, provider: { select: { plan: true } } },
  });
  if (!offer || offer.request.authorId !== actor.id) throw new NotFoundError("Oferta no encontrada");
  if (offer.request.status !== "OPEN" || offer.status !== "PENDING") throw new ConflictError("Esta oferta ya no se puede elegir");

  const payment = await db.$transaction(async (tx) => {
    // Condición en el where: si dos pestañas eligen a la vez, solo una gana.
    const { count } = await tx.request.updateMany({
      where: { id: offer.requestId, status: "OPEN" },
      data: { status: "AWAITING_PAYMENT", escrow: "PENDING", acceptedOfferId: offerId },
    });
    if (!count) throw new ConflictError("La solicitud ya no está abierta");
    // La comisión se congela aquí, según el plan del proveedor en este momento.
    const accepted = await tx.offer.updateMany({
      where: { id: offerId, status: "PENDING" },
      data: { status: "ACCEPTED", feeRate: planOf(offer.provider.plan).fee },
    });
    if (!accepted.count) throw new ConflictError("Esta oferta ya no se puede elegir");
    return tx.payment.create({
      data: { code: paymentCode(), amountCents: toCents(offer.price), requestId: offer.requestId, offerId, payerId: actor.id },
    });
  });

  await notify(
    offer.providerId,
    "Te eligieron: esperando el pago",
    `${offer.request.title} · te avisamos cuando el pago quede protegido. Aún no empieces.`,
    `/solicitudes/${offer.requestId}`,
  );
  return payment;
}

/** El cliente se arrepiente antes de pagar: la solicitud vuelve a recibir ofertas. Devuelve la solicitud. */
export async function cancelPayment(actor: Actor, paymentId: string) {
  const payment = await db.payment.findUnique({ where: { id: paymentId }, include: { request: { select: { title: true } } } });
  if (!payment || payment.payerId !== actor.id) throw new NotFoundError("Pago no encontrado");

  await db.$transaction(async (tx) => {
    // Solo si el pago sigue pendiente: un comprobante enviado o confirmado no se puede cancelar así.
    const { count } = await tx.payment.updateMany({
      where: { id: paymentId, status: { in: ["PENDING", "REJECTED"] } },
      data: { status: "CANCELLED" },
    });
    if (!count) throw new ConflictError("Este pago ya no se puede cancelar");
    const reopened = await tx.request.updateMany({
      where: { id: payment.requestId, status: "AWAITING_PAYMENT", acceptedOfferId: payment.offerId },
      data: { status: "OPEN", escrow: "NONE", acceptedOfferId: null },
    });
    if (!reopened.count) throw new ConflictError("Este pago ya no se puede cancelar");
    await tx.offer.updateMany({ where: { id: payment.offerId, status: "ACCEPTED" }, data: { status: "PENDING" } });
  });

  const offer = await db.offer.findUniqueOrThrow({ where: { id: payment.offerId }, select: { providerId: true } });
  await notify(offer.providerId, "El cliente reconsideró su elección", `Tu oferta sigue activa · ${payment.request.title}`, `/solicitudes/${payment.requestId}`);
  return payment.requestId;
}

export async function submitReceipt(actor: Actor, paymentId: string, input: { method: string; reference: string; file: File }) {
  const payment = await db.payment.findUnique({ where: { id: paymentId }, include: { request: { select: { title: true } } } });
  if (!payment || payment.payerId !== actor.id) throw new NotFoundError("Pago no encontrado");
  if (payment.status !== "PENDING" && payment.status !== "REJECTED") throw new ConflictError("Este pago ya fue enviado");

  const receiptPath = await saveReceipt(input.file, payment.id);
  // Condicionado al estado: si el plazo de pago venció o el cliente canceló mientras se subía el archivo, no se reactiva.
  const { count } = await db.payment.updateMany({
    where: { id: paymentId, status: { in: ["PENDING", "REJECTED"] }, request: { status: "AWAITING_PAYMENT" } },
    data: {
      method: input.method === "DEUNA" ? "DEUNA" : "TRANSFER",
      reference: input.reference.trim().slice(0, 100),
      receiptPath,
      status: "SUBMITTED",
      submittedAt: new Date(),
      adminNote: "",
    },
  });
  if (!count) throw new ConflictError("Este pago ya no está pendiente. Revisa el estado de tu solicitud.");
  await notifyAdmins("Comprobante por verificar", `${payment.code} · ${fmtCents(payment.amountCents)} · ${payment.request.title}`, "/admin");
}

/** Comprobante de un pago: solo lo ve quien pagó o un administrador. */
export async function receiptFor(actor: Actor, paymentId: string) {
  const payment = await db.payment.findUnique({ where: { id: paymentId }, select: { payerId: true, receiptPath: true } });
  if (!payment?.receiptPath) throw new NotFoundError();
  if (payment.payerId !== actor.id && actor.role !== "ADMIN") throw new ForbiddenError();
  return payment.receiptPath;
}
