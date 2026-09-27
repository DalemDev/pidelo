import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { post, balance, type Tx } from "./ledger";
import { notify } from "./matching";
import {
  ACCOUNTS,
  AUTO_RELEASE_HOURS,
  NEW_PROVIDER_HOLD_DAYS,
  NEW_PROVIDER_JOBS,
  fmtCents,
  splitFee,
} from "./money";

export class EscrowError extends Error {}

// Código corto y legible para la descripción de la transferencia (sin 0/O/1/I para evitar confusiones).
export function paymentCode() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = randomBytes(6);
  return "PID-" + [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

export async function notifyAdmins(title: string, body: string, link: string) {
  const admins = await db.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  if (admins.length) {
    await db.notification.createMany({ data: admins.map((a) => ({ userId: a.id, title, body, link })) });
  }
}

// ---------------------------------------------------------------------------
// Entrada del dinero

/** El admin verificó el depósito en el banco: el dinero entra y queda retenido. */
export async function confirmPayment(paymentId: string) {
  const payment = await db.$transaction(async (tx) => {
    const p = await tx.payment.findUnique({ where: { id: paymentId }, include: { request: true } });
    if (!p) throw new EscrowError("Pago no encontrado");
    if (p.status !== "SUBMITTED" && p.status !== "PENDING") throw new EscrowError("Este pago ya fue procesado");
    if (p.request.acceptedOfferId !== p.offerId || p.request.status !== "AWAITING_PAYMENT") {
      throw new EscrowError("La solicitud ya no está esperando este pago");
    }

    await tx.payment.update({ where: { id: p.id }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
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
    await tx.request.update({ where: { id: p.requestId }, data: { status: "IN_PROGRESS", escrow: "HELD" } });
    // Recién con el pago confirmado se descartan las demás ofertas.
    await tx.offer.updateMany({
      where: { requestId: p.requestId, id: { not: p.offerId }, status: "PENDING" },
      data: { status: "REJECTED" },
    });
    return p;
  });

  const offer = await db.offer.findUniqueOrThrow({ where: { id: payment.offerId } });
  await notify(
    offer.providerId,
    "🛡️ ¡Pago protegido! Ya puedes empezar",
    `${payment.request.title} · ${fmtCents(payment.amountCents)} retenidos hasta la entrega`,
    `/solicitudes/${payment.requestId}`,
  );
  await notify(payment.payerId, "✅ Confirmamos tu pago", `Tu dinero está protegido · ${payment.request.title}`, `/solicitudes/${payment.requestId}`);
}

// ---------------------------------------------------------------------------
// Salida del escrow

async function escrowContext(tx: Tx, requestId: string) {
  const request = await tx.request.findUniqueOrThrow({ where: { id: requestId }, include: { acceptedOffer: true } });
  if (!request.acceptedOffer) throw new EscrowError("La solicitud no tiene oferta aceptada");
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
 * Libera el pago al proveedor. El `updateMany` condicionado al estado evita liberar dos veces
 * si el cliente confirma justo cuando corre la liberación automática.
 */
export async function releaseEscrow(requestId: string, why: "CONFIRMED" | "AUTO") {
  const result = await db.$transaction(async (tx) => {
    const { count } = await tx.request.updateMany({
      where: { id: requestId, escrow: "HELD", status: { in: ["IN_PROGRESS", "DELIVERED"] } },
      data: { status: "COMPLETED", escrow: "RELEASED" },
    });
    if (count === 0) throw new EscrowError("Este pago no se puede liberar en su estado actual");
    const { request, offer, held } = await escrowContext(tx, requestId);
    const net = await payProvider(
      tx,
      requestId,
      offer.providerId,
      held,
      offer.feeRate,
      why === "AUTO" ? `Liberación automática · ${request.title}` : `Liberación confirmada · ${request.title}`,
    );
    return { request, offer, net };
  });

  await notify(
    result.offer.providerId,
    why === "AUTO" ? "💸 Pago liberado automáticamente" : "✅ Trabajo confirmado, pago liberado",
    `${fmtCents(result.net)} disponibles en tu billetera · ${result.request.title}`,
    "/billetera",
  );
  if (why === "AUTO") {
    await notify(result.request.authorId, "💸 Liberamos el pago", `Pasaron ${AUTO_RELEASE_HOURS} h sin reportes · ${result.request.title}`, `/solicitudes/${requestId}`);
  }
}

/** Sin cron: se llama al navegar (navbar). Libera los trabajos entregados hace más de 72 h sin disputa. */
export async function releaseDueEscrows() {
  const due = await db.request.findMany({
    where: {
      status: "DELIVERED",
      escrow: "HELD",
      deliveredAt: { lte: new Date(Date.now() - AUTO_RELEASE_HOURS * 3600_000) },
    },
    select: { id: true },
    take: 20,
  });
  for (const r of due) {
    try {
      await releaseEscrow(r.id, "AUTO");
    } catch (e) {
      if (!(e instanceof EscrowError)) throw e;
    }
  }
}

// ---------------------------------------------------------------------------
// Disputas

export type Resolution = "REFUND" | "RELEASE" | "SPLIT";

export async function resolveDispute(disputeId: string, resolution: Resolution, refundCents: number, adminNote: string) {
  const out = await db.$transaction(async (tx) => {
    const dispute = await tx.dispute.findUnique({ where: { id: disputeId } });
    if (!dispute || dispute.status !== "OPEN") throw new EscrowError("La disputa no está abierta");
    const { request, offer, held } = await escrowContext(tx, dispute.requestId);
    if (request.escrow !== "DISPUTED" || held <= 0) throw new EscrowError("No hay dinero retenido para esta disputa");

    const refund = resolution === "REFUND" ? held : resolution === "RELEASE" ? 0 : refundCents;
    if (refund < 0 || refund > held) throw new EscrowError(`El reembolso debe estar entre $0 y ${fmtCents(held)}`);
    if (resolution === "SPLIT" && (refund === 0 || refund === held)) {
      throw new EscrowError("Para un reparto, el reembolso debe ser parcial");
    }

    if (refund > 0) await refundClient(tx, request.id, request.authorId, refund, `Reembolso por disputa · ${request.title}`);
    let providerNet = 0;
    if (held - refund > 0) {
      providerNet = await payProvider(tx, request.id, offer.providerId, held - refund, offer.feeRate, `Liberación por disputa · ${request.title}`);
    }

    await tx.dispute.update({
      where: { id: disputeId },
      data: { status: "RESOLVED", resolution, refundCents: refund, adminNote, resolvedAt: new Date() },
    });
    await tx.request.update({
      where: { id: request.id },
      data: refund === held ? { status: "CANCELLED", escrow: "REFUNDED" } : { status: "COMPLETED", escrow: "RELEASED" },
    });
    return { request, offer, refund, providerNet };
  });

  const link = `/solicitudes/${out.request.id}`;
  const note = adminNote ? ` · ${adminNote}` : "";
  await notify(
    out.request.authorId,
    "⚖️ Disputa resuelta",
    (out.refund ? `Te reembolsamos ${fmtCents(out.refund)} a tu billetera` : "El pago se liberó al proveedor") + note,
    out.refund ? "/billetera" : link,
  );
  await notify(
    out.offer.providerId,
    "⚖️ Disputa resuelta",
    (out.providerNet ? `Recibiste ${fmtCents(out.providerNet)} en tu billetera` : "El pago se reembolsó al cliente") + note,
    out.providerNet ? "/billetera" : link,
  );
}

// ---------------------------------------------------------------------------
// Billetera

export async function walletSummary(userId: string) {
  const [available, payoutPending, paidOut, heldJobs, completedJobs, recentReleases, entries] = await Promise.all([
    balance(ACCOUNTS.available(userId)),
    balance(ACCOUNTS.payoutPending(userId)),
    db.payout.aggregate({ where: { userId, status: "PAID" }, _sum: { amountCents: true } }),
    db.request.findMany({
      where: { escrow: { in: ["HELD", "DISPUTED"] }, acceptedOffer: { providerId: userId } },
      select: { id: true, title: true, escrow: true, status: true, acceptedOffer: { select: { feeRate: true } } },
    }),
    db.offer.count({ where: { providerId: userId, status: "ACCEPTED", request: { status: "COMPLETED" } } }),
    db.ledgerEntry.aggregate({
      where: {
        account: ACCOUNTS.available(userId),
        refType: "RELEASE",
        createdAt: { gte: new Date(Date.now() - NEW_PROVIDER_HOLD_DAYS * 86400_000) },
      },
      _sum: { amountCents: true },
    }),
    db.ledgerEntry.findMany({
      where: { account: { in: [ACCOUNTS.available(userId), ACCOUNTS.payoutPending(userId)] } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  const held = await Promise.all(
    heldJobs.map(async (r) => {
      const cents = await balance(ACCOUNTS.escrow(r.id));
      return { ...r, cents, net: splitFee(cents, r.acceptedOffer?.feeRate ?? 0.1).provider };
    }),
  );

  // Proveedores nuevos: lo liberado en los últimos días aún no se puede retirar.
  const isNew = completedJobs < NEW_PROVIDER_JOBS;
  const locked = isNew ? Math.min(available, recentReleases._sum.amountCents ?? 0) : 0;

  return {
    available,
    withdrawable: Math.max(0, available - locked),
    locked,
    isNew,
    payoutPending,
    paidOut: paidOut._sum.amountCents ?? 0,
    held,
    heldTotal: held.reduce((s, h) => s + h.net, 0),
    entries,
  };
}
