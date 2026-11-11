import "server-only";
import { db } from "@/server/db/client";
import { grantCredits } from "@/server/services/credits";
import { notify } from "@/server/services/notifications";
import { EXPIRY_WARNING_DAYS, PAYMENT_DEADLINE_HOURS, REQUEST_EXPIRY_DAYS } from "@/domain/policies";

const DAY = 86400_000;

/**
 * Vencimiento de solicitudes abandonadas (sin cron: se llama al navegar y desde /api/cron/liberar).
 * - A los 12 días sin actividad avisa al cliente que su solicitud está por vencer.
 * - A los 14 días la cierra y devuelve los créditos de cada oferta pendiente.
 * "Actividad" = publicarla o volver a subirla (bumpedAt).
 */
export async function expireStaleRequests() {
  const now = Date.now();

  // 1. Recordatorio previo, solo si hay ofertas que elegir (y una sola vez).
  const toWarn = await db.request.findMany({
    where: {
      status: "OPEN",
      expiryWarned: false,
      // Entre el día 12 y el 14: las que ya pasaron el plazo vencen directo, sin aviso previo.
      bumpedAt: {
        lte: new Date(now - (REQUEST_EXPIRY_DAYS - EXPIRY_WARNING_DAYS) * DAY),
        gt: new Date(now - REQUEST_EXPIRY_DAYS * DAY),
      },
      offers: { some: { status: "PENDING" } },
    },
    select: { id: true, title: true, authorId: true },
    take: 50,
  });
  for (const r of toWarn) {
    const { count } = await db.request.updateMany({ where: { id: r.id, expiryWarned: false }, data: { expiryWarned: true } });
    if (count) {
      await notify(
        r.authorId,
        `Tu solicitud vence en ${EXPIRY_WARNING_DAYS} días`,
        `Elige una oferta o vuelve a subirla para mantenerla abierta · ${r.title}`,
        `/solicitudes/${r.id}`,
      );
    }
  }

  // 2. Vencimiento con devolución de créditos.
  const due = await db.request.findMany({
    where: { status: "OPEN", bumpedAt: { lte: new Date(now - REQUEST_EXPIRY_DAYS * DAY) } },
    select: { id: true, title: true, authorId: true },
    take: 20,
  });
  for (const r of due) {
    const refunded = await db.$transaction(async (tx) => {
      // Condicionado al estado: si el cliente elige una oferta justo ahora, gana su acción.
      const { count } = await tx.request.updateMany({ where: { id: r.id, status: "OPEN" }, data: { status: "EXPIRED" } });
      if (!count) return null;
      const pending = await tx.offer.findMany({ where: { requestId: r.id, status: "PENDING" } });
      await tx.offer.updateMany({ where: { requestId: r.id, status: "PENDING" }, data: { status: "REJECTED" } });
      for (const o of pending) {
        if (o.creditsSpent > 0) {
          await grantCredits(tx, o.providerId, o.creditsSpent, "REFUND", `Devolución: solicitud vencida · ${r.title}`);
        }
      }
      return pending;
    });
    if (!refunded) continue;

    for (const o of refunded) {
      await notify(
        o.providerId,
        "La solicitud venció sin elegir oferta",
        `Te devolvimos ${o.creditsSpent} crédito${o.creditsSpent === 1 ? "" : "s"} · ${r.title}`,
        "/creditos",
      );
    }
    await notify(
      r.authorId,
      "Tu solicitud venció",
      refunded.length
        ? `Pasaron ${REQUEST_EXPIRY_DAYS} días sin elegir oferta. Puedes publicarla de nuevo · ${r.title}`
        : `Pasaron ${REQUEST_EXPIRY_DAYS} días sin ofertas. Prueba publicarla de nuevo con más detalles · ${r.title}`,
      `/solicitudes/${r.id}`,
    );
  }
}

/**
 * Plazo de pago (sin cron: se llama al navegar y desde /api/cron/liberar). Si el cliente eligió una oferta
 * y pasan 48 h sin comprobante (o desde que se rechazó el último), se cancela el pago, la oferta vuelve a
 * competir y la solicitud se reabre. Los comprobantes ya enviados (SUBMITTED) no vencen: los revisa un admin.
 */
export async function expireUnpaidSelections() {
  const cutoff = new Date(Date.now() - PAYMENT_DEADLINE_HOURS * 3600_000);
  const due = await db.payment.findMany({
    where: {
      status: { in: ["PENDING", "REJECTED"] },
      request: { status: "AWAITING_PAYMENT" },
      OR: [{ submittedAt: null, createdAt: { lte: cutoff } }, { submittedAt: { lte: cutoff } }],
    },
    include: { request: { select: { title: true } } },
    take: 20,
  });

  for (const p of due) {
    const reopened = await db.$transaction(async (tx) => {
      // Condicionado al estado: si el cliente sube el comprobante justo ahora, gana su acción.
      const { count } = await tx.payment.updateMany({
        where: { id: p.id, status: { in: ["PENDING", "REJECTED"] } },
        data: { status: "CANCELLED", adminNote: `Venció el plazo de ${PAYMENT_DEADLINE_HOURS} h para pagar` },
      });
      if (!count) return null;
      await tx.offer.update({ where: { id: p.offerId }, data: { status: "PENDING" } });
      // Se reinicia bumpedAt para que la solicitud reabierta no venza de inmediato.
      await tx.request.update({
        where: { id: p.requestId },
        data: { status: "OPEN", escrow: "NONE", acceptedOfferId: null, bumpedAt: new Date(), expiryWarned: false },
      });
      return tx.offer.findUniqueOrThrow({ where: { id: p.offerId }, select: { providerId: true } });
    });
    if (!reopened) continue;

    await notify(
      p.payerId,
      "Venció el plazo para pagar",
      `Pasaron ${PAYMENT_DEADLINE_HOURS} h sin pago. Tu solicitud volvió a recibir ofertas · ${p.request.title}`,
      `/solicitudes/${p.requestId}`,
    );
    await notify(
      reopened.providerId,
      "El cliente no completó el pago",
      `Tu oferta sigue activa por si vuelve a elegirte · ${p.request.title}`,
      `/solicitudes/${p.requestId}`,
    );
  }
}

/**
 * Retención de datos (política de privacidad): borra registros de seguridad que ya no se necesitan.
 * Los asientos contables y pagos no se tocan: la normativa tributaria obliga a conservarlos.
 */
export async function purgeExpiredRecords() {
  const now = Date.now();
  await Promise.all([
    db.rateLimitEvent.deleteMany({ where: { createdAt: { lt: new Date(now - DAY) } } }),
    db.session.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date(now) } }, { revokedAt: { lt: new Date(now - 30 * DAY) } }] } }),
    db.passwordReset.deleteMany({ where: { expiresAt: { lt: new Date(now - DAY) } } }),
    db.auditLog.deleteMany({ where: { createdAt: { lt: new Date(now - 365 * DAY) } } }),
  ]);
}
