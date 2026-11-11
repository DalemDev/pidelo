import "server-only";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors";
import { ACCOUNTS, AUTO_RELEASE_HOURS, fmtCents, splitFee } from "@/domain/money";
import { assertAdmin } from "@/server/auth/guards";
import type { Actor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import type { Tx } from "@/server/db/client";
import { logger } from "@/server/infra/logger";
import { audit } from "./audit";
import { balance, post } from "./ledger";
import { notify, notifyAdmins } from "./notifications";

// Pago retenido: el dinero del cliente entra a ESCROW:<solicitud> y sale al proveedor (menos la comisión)
// o de vuelta al cliente. Toda transición de estado está condicionada al estado esperado, de modo que
// dos operaciones simultáneas nunca muevan el mismo dinero dos veces.

// ---------------------------------------------------------------------------
// Entrada del dinero (revisión del comprobante por un administrador)

/** El admin verificó el depósito en el banco: el dinero entra y queda retenido. */
export async function confirmPayment(actor: Actor, paymentId: string) {
  assertAdmin(actor);
  const payment = await db.$transaction(async (tx) => {
    const p = await tx.payment.findUnique({ where: { id: paymentId }, include: { request: true } });
    if (!p) throw new NotFoundError("Pago no encontrado");
    if (p.request.acceptedOfferId !== p.offerId || p.request.status !== "AWAITING_PAYMENT") {
      throw new ConflictError("La solicitud ya no está esperando este pago");
    }
    // Condicionado al estado: si dos admins confirman a la vez (o doble clic), solo uno registra el dinero.
    const { count } = await tx.payment.updateMany({
      where: { id: p.id, status: { in: ["SUBMITTED", "PENDING"] } },
      data: { status: "CONFIRMED", confirmedAt: new Date(), reviewedById: actor.id },
    });
    if (!count) throw new ConflictError("Este pago ya fue procesado");

    await post(
      tx,
      [
        { account: ACCOUNTS.WORLD, amountCents: -p.amountCents },
        { account: ACCOUNTS.escrow(p.requestId), amountCents: p.amountCents },
      ],
      `Pago ${p.code} recibido`,
      "PAYMENT",
      p.id,
    );
    const moved = await tx.request.updateMany({
      where: { id: p.requestId, status: "AWAITING_PAYMENT" },
      data: { status: "IN_PROGRESS", escrow: "HELD" },
    });
    if (!moved.count) throw new ConflictError("La solicitud ya no está esperando este pago");
    // Recién con el pago confirmado se descartan las demás ofertas.
    await tx.offer.updateMany({
      where: { requestId: p.requestId, id: { not: p.offerId }, status: "PENDING" },
      data: { status: "REJECTED" },
    });
    await audit({ actorId: actor.id, action: "payment.confirm", entity: "Payment", entityId: p.id, data: { cents: p.amountCents } }, tx);
    return p;
  });

  const offer = await db.offer.findUniqueOrThrow({ where: { id: payment.offerId }, select: { providerId: true } });
  await notify(
    offer.providerId,
    "Pago protegido: ya puedes empezar",
    `${payment.request.title} · ${fmtCents(payment.amountCents)} retenidos hasta la entrega`,
    `/solicitudes/${payment.requestId}`,
  );
  await notify(payment.payerId, "Confirmamos tu pago", `Tu dinero está protegido · ${payment.request.title}`, `/solicitudes/${payment.requestId}`);
}

export async function rejectPayment(actor: Actor, paymentId: string, note: string) {
  assertAdmin(actor);
  if (note.trim().length < 5) throw new ValidationError("Explica al cliente qué está mal en el comprobante");
  const payment = await db.$transaction(async (tx) => {
    // Condicionado: no se puede rechazar un pago que otro admin acaba de confirmar.
    const { count } = await tx.payment.updateMany({
      where: { id: paymentId, status: "SUBMITTED" },
      data: { status: "REJECTED", adminNote: note.slice(0, 500), reviewedById: actor.id },
    });
    if (!count) throw new ConflictError("Este pago no está por verificar");
    await audit({ actorId: actor.id, action: "payment.reject", entity: "Payment", entityId: paymentId, data: { note } }, tx);
    return tx.payment.findUniqueOrThrow({ where: { id: paymentId }, select: { payerId: true } });
  });
  await notify(payment.payerId, "No pudimos verificar tu pago", note, `/pagos/${paymentId}`);
}

// ---------------------------------------------------------------------------
// Salida del escrow

async function escrowContext(tx: Tx, requestId: string) {
  const request = await tx.request.findUniqueOrThrow({ where: { id: requestId }, include: { acceptedOffer: true } });
  if (!request.acceptedOffer) throw new ConflictError("La solicitud no tiene oferta aceptada");
  const held = await balance(ACCOUNTS.escrow(requestId), tx);
  return { request, offer: request.acceptedOffer, held };
}

/** Pasa `cents` del escrow al proveedor, descontando la comisión congelada en la oferta. */
async function payProvider(tx: Tx, requestId: string, providerId: string, cents: number, feeRate: number, memo: string) {
  const { fee, provider } = splitFee(cents, feeRate);
  await post(
    tx,
    [
      { account: ACCOUNTS.escrow(requestId), amountCents: -cents },
      { account: ACCOUNTS.available(providerId), amountCents: provider },
      { account: ACCOUNTS.REVENUE, amountCents: fee },
    ],
    memo,
    "RELEASE",
    requestId,
  );
  return provider;
}

async function refundClient(tx: Tx, requestId: string, clientId: string, cents: number, memo: string) {
  await post(
    tx,
    [
      { account: ACCOUNTS.escrow(requestId), amountCents: -cents },
      { account: ACCOUNTS.available(clientId), amountCents: cents },
    ],
    memo,
    "REFUND",
    requestId,
  );
}

/**
 * Libera el pago al proveedor. El updateMany condicionado al estado evita liberar dos veces
 * si el cliente confirma justo cuando corre la liberación automática.
 */
async function releaseEscrow(requestId: string, why: "CONFIRMED" | "AUTO", actorId: string | null) {
  const result = await db.$transaction(async (tx) => {
    const { count } = await tx.request.updateMany({
      where: { id: requestId, escrow: "HELD", status: { in: ["IN_PROGRESS", "DELIVERED"] } },
      data: { status: "COMPLETED", escrow: "RELEASED" },
    });
    if (count === 0) throw new ConflictError("Este pago no se puede liberar en su estado actual");
    const { request, offer, held } = await escrowContext(tx, requestId);
    const net = await payProvider(
      tx,
      requestId,
      offer.providerId,
      held,
      offer.feeRate,
      why === "AUTO" ? `Liberación automática · ${request.title}` : `Liberación confirmada · ${request.title}`,
    );
    await audit({ actorId, action: why === "AUTO" ? "escrow.auto_release" : "escrow.release", entity: "Request", entityId: requestId, data: { held, net } }, tx);
    return { request, offer, net };
  });

  await notify(
    result.offer.providerId,
    why === "AUTO" ? "Pago liberado automáticamente" : "Trabajo confirmado, pago liberado",
    `${fmtCents(result.net)} disponibles en tu billetera · ${result.request.title}`,
    "/billetera",
  );
  if (why === "AUTO") {
    await notify(result.request.authorId, "Liberamos el pago", `Pasaron ${AUTO_RELEASE_HOURS} h sin reportes · ${result.request.title}`, `/solicitudes/${requestId}`);
  }
}

/** El cliente confirma que recibió el trabajo. */
export async function confirmCompletion(actor: Actor, requestId: string) {
  const request = await db.request.findUnique({ where: { id: requestId }, select: { authorId: true } });
  if (!request) throw new NotFoundError();
  if (request.authorId !== actor.id) throw new ForbiddenError();
  await releaseEscrow(requestId, "CONFIRMED", actor.id);
}

/** Trabajo programado: libera los trabajos entregados hace más de 72 h sin disputa. */
export async function releaseDueEscrows() {
  const due = await db.request.findMany({
    where: { status: "DELIVERED", escrow: "HELD", deliveredAt: { lte: new Date(Date.now() - AUTO_RELEASE_HOURS * 3600_000) } },
    select: { id: true },
    take: 50,
  });
  for (const r of due) {
    try {
      await releaseEscrow(r.id, "AUTO", null);
    } catch (error) {
      if (!(error instanceof ConflictError)) logger.error("auto_release_failed", { requestId: r.id, error });
    }
  }
}

// ---------------------------------------------------------------------------
// Disputas

/** Congela el dinero: ni el cliente puede liberar ni corre la liberación automática. */
export async function openDispute(actor: Actor, requestId: string, reason: string) {
  const request = await db.request.findUnique({ where: { id: requestId }, include: { acceptedOffer: { select: { providerId: true } } } });
  if (!request?.acceptedOffer) throw new NotFoundError("Solicitud no encontrada");
  const participants = [request.authorId, request.acceptedOffer.providerId];
  if (!participants.includes(actor.id)) throw new ForbiddenError("No participas en este trabajo");

  // Congelar y crear la disputa van juntos: nunca queda dinero congelado sin una disputa que resolver.
  await db.$transaction(async (tx) => {
    const { count } = await tx.request.updateMany({
      where: { id: requestId, escrow: "HELD", status: { in: ["IN_PROGRESS", "DELIVERED"] } },
      data: { escrow: "DISPUTED" },
    });
    if (!count) throw new ConflictError("Ya no se puede abrir una disputa para este trabajo");
    const dispute = await tx.dispute.create({ data: { requestId, openedById: actor.id, reason } });
    await audit({ actorId: actor.id, action: "dispute.open", entity: "Dispute", entityId: dispute.id, data: { requestId } }, tx);
  });

  const other = participants.find((p) => p !== actor.id)!;
  await notify(other, "Se abrió una disputa", `El pago queda congelado hasta que el equipo de Pídelo lo revise · ${request.title}`, `/solicitudes/${requestId}`);
  await notifyAdmins("Nueva disputa", `${request.title} · ${reason.slice(0, 100)}`, "/admin");
}

export type Resolution = "REFUND" | "RELEASE" | "SPLIT";

export async function resolveDispute(actor: Actor, disputeId: string, resolution: Resolution, refundCents: number, adminNote: string) {
  assertAdmin(actor);
  if (!["REFUND", "RELEASE", "SPLIT"].includes(resolution)) throw new ValidationError("Elige una resolución");

  const out = await db.$transaction(async (tx) => {
    // Condicionado: dos admins no pueden resolver la misma disputa.
    const claimed = await tx.dispute.updateMany({ where: { id: disputeId, status: "OPEN" }, data: { status: "RESOLVING" } });
    if (!claimed.count) throw new ConflictError("La disputa no está abierta");
    const dispute = await tx.dispute.findUniqueOrThrow({ where: { id: disputeId } });
    const { request, offer, held } = await escrowContext(tx, dispute.requestId);
    if (request.escrow !== "DISPUTED" || held <= 0) throw new ConflictError("No hay dinero retenido para esta disputa");

    const refund = resolution === "REFUND" ? held : resolution === "RELEASE" ? 0 : refundCents;
    if (!Number.isSafeInteger(refund) || refund < 0 || refund > held) {
      throw new ValidationError(`El reembolso debe estar entre $0 y ${fmtCents(held)}`);
    }
    if (resolution === "SPLIT" && (refund === 0 || refund === held)) throw new ValidationError("Para un reparto, el reembolso debe ser parcial");

    if (refund > 0) await refundClient(tx, request.id, request.authorId, refund, `Reembolso por disputa · ${request.title}`);
    let providerNet = 0;
    if (held - refund > 0) {
      providerNet = await payProvider(tx, request.id, offer.providerId, held - refund, offer.feeRate, `Liberación por disputa · ${request.title}`);
    }

    await tx.dispute.update({
      where: { id: disputeId },
      data: { status: "RESOLVED", resolution, refundCents: refund, adminNote: adminNote.slice(0, 500), resolvedAt: new Date(), resolvedById: actor.id },
    });
    await tx.request.update({
      where: { id: request.id },
      data: refund === held ? { status: "CANCELLED", escrow: "REFUNDED" } : { status: "COMPLETED", escrow: "RELEASED" },
    });
    await audit({ actorId: actor.id, action: "dispute.resolve", entity: "Dispute", entityId: disputeId, data: { resolution, refund, held } }, tx);
    return { request, offer, refund, providerNet };
  });

  const link = `/solicitudes/${out.request.id}`;
  const note = adminNote ? ` · ${adminNote}` : "";
  await notify(
    out.request.authorId,
    "Disputa resuelta",
    (out.refund ? `Te reembolsamos ${fmtCents(out.refund)} a tu billetera` : "El pago se liberó al proveedor") + note,
    out.refund ? "/billetera" : link,
  );
  await notify(
    out.offer.providerId,
    "Disputa resuelta",
    (out.providerNet ? `Recibiste ${fmtCents(out.providerNet)} en tu billetera` : "El pago se reembolsó al cliente") + note,
    out.providerNet ? "/billetera" : link,
  );
}
