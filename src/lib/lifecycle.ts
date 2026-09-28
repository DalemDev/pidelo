import "server-only";
import { db } from "./db";
import { grantCredits } from "./credits";
import { notify } from "./matching";
import { EXPIRY_WARNING_DAYS, REQUEST_EXPIRY_DAYS } from "./constants";

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
        `⌛ Tu solicitud vence en ${EXPIRY_WARNING_DAYS} días`,
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
        "↩️ La solicitud venció sin elegir oferta",
        `Te devolvimos ${o.creditsSpent} crédito${o.creditsSpent === 1 ? "" : "s"} · ${r.title}`,
        "/creditos",
      );
    }
    await notify(
      r.authorId,
      "⌛ Tu solicitud venció",
      refunded.length
        ? `Pasaron ${REQUEST_EXPIRY_DAYS} días sin elegir oferta. Puedes publicarla de nuevo · ${r.title}`
        : `Pasaron ${REQUEST_EXPIRY_DAYS} días sin ofertas. Prueba publicarla de nuevo con más detalles · ${r.title}`,
      `/solicitudes/${r.id}`,
    );
  }
}
