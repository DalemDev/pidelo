import "server-only";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors";
import { BOOST_COSTS, BUMP_COOLDOWN_HOURS, FEATURE_DAYS, isFeatured } from "@/domain/policies";
import type { RequestInput } from "@/domain/schemas";
import { assertActive, assertMember } from "@/server/auth/guards";
import type { Actor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { LIMITS, consume } from "@/server/infra/rate-limit";
import { draftRequest, type Draft } from "@/server/infra/ai/request-draft";
import { grantCredits, spendCredits } from "./credits";
import { notifyMatchingProviders } from "./matching";
import { recordViolation, screenText, warningText } from "./moderation";
import { notify } from "./notifications";

// Solicitudes: publicar (gratis, con opciones pagadas en créditos), cancelar, impulsar y entregar.

export async function draftWithAssistant(actor: Actor, text: string): Promise<Draft> {
  assertMember(actor);
  const clean = text.trim();
  if (clean.length < 10) throw new ValidationError("Cuéntanos un poco más (al menos 10 caracteres)");
  if (clean.length > 3000) throw new ValidationError("El texto es muy largo (máximo 3000 caracteres)");
  await consume(LIMITS.aiDraft(actor.id), (m) => `Usaste el asistente muchas veces seguidas. Intenta en ${m} min o completa el formulario.`);
  return draftRequest(clean);
}

/** Publica una solicitud. Devuelve la solicitud y si se ocultaron datos de contacto. */
export async function createRequest(actor: Actor, input: RequestInput) {
  assertMember(actor);
  assertActive(actor);
  await consume(LIMITS.request(actor.id), (m) => `Publicaste muchas solicitudes seguidas. Intenta de nuevo en ${m} min.`);

  // Las publicaciones son públicas: nunca deben llevar datos de contacto.
  const [title, description] = await Promise.all([screenText(input.title), screenText(input.description)]);
  const flagged = [title, description].find((r) => r.blocked) ?? [title, description].find((r) => r.masked);
  if (flagged) {
    const strikes = await recordViolation(actor.id, "REQUEST", `${input.title}\n\n${input.description}`, flagged);
    if (flagged.blocked) throw new ValidationError(warningText(flagged, strikes));
  }

  // Publicar es gratis; "urgente" y "destacar" se pagan con créditos.
  const { featured, ...fields } = input;
  const boosts = [
    fields.urgent && { cost: BOOST_COSTS.URGENT, reason: "URGENT", label: "Marcar como urgente" },
    featured && { cost: BOOST_COSTS.FEATURE, reason: "FEATURE", label: `Destacar ${FEATURE_DAYS} días` },
  ].filter((b) => !!b);

  const request = await db.$transaction(async (tx) => {
    for (const b of boosts) await spendCredits(tx, actor.id, b.cost, b.reason, `${b.label} · ${title.text}`);
    return tx.request.create({
      data: {
        ...fields,
        title: title.text,
        description: description.text,
        featuredUntil: featured ? new Date(Date.now() + FEATURE_DAYS * 86400_000) : null,
        authorId: actor.id,
      },
    });
  });
  await notifyMatchingProviders(request);
  return { request, masked: !!flagged };
}

/**
 * El autor cancela una solicitud abierta (o elegida pero aún sin pago enviado). Quienes ofertaron
 * recuperan sus créditos. Todo ocurre en una transacción condicionada al estado: llamadas simultáneas,
 * o el vencimiento automático corriendo a la vez, no pueden devolver los créditos dos veces.
 */
export async function cancelRequest(actor: Actor, requestId: string) {
  const request = await db.request.findUnique({ where: { id: requestId }, select: { authorId: true, title: true } });
  if (!request || request.authorId !== actor.id) throw new NotFoundError("Solicitud no encontrada");

  const refunded = await db.$transaction(async (tx) => {
    // Si ya hay un comprobante enviado o confirmado, se resuelve por disputa, no cancelando.
    const paid = await tx.payment.count({ where: { requestId, status: { in: ["SUBMITTED", "CONFIRMED"] } } });
    if (paid) throw new ConflictError("Ya enviaste un pago para esta solicitud. Si hay un problema, abre una disputa.");
    const { count } = await tx.request.updateMany({
      where: { id: requestId, status: { in: ["OPEN", "AWAITING_PAYMENT"] } },
      data: { status: "CANCELLED", escrow: "NONE" },
    });
    if (!count) throw new ConflictError("Esta solicitud ya no se puede cancelar");

    const pending = await tx.offer.findMany({ where: { requestId, status: { in: ["PENDING", "ACCEPTED"] } } });
    await tx.offer.updateMany({ where: { requestId, status: { in: ["PENDING", "ACCEPTED"] } }, data: { status: "REJECTED" } });
    await tx.payment.updateMany({ where: { requestId, status: { in: ["PENDING", "REJECTED"] } }, data: { status: "CANCELLED" } });
    for (const o of pending) {
      await grantCredits(tx, o.providerId, o.creditsSpent, "REFUND", `Devolución: solicitud cancelada · ${request.title}`);
    }
    return pending;
  });

  for (const o of refunded) {
    await notify(o.providerId, "Solicitud cancelada", `Te devolvimos ${o.creditsSpent} crédito(s) · ${request.title}`, "/creditos");
  }
}

export type BoostKind = "FEATURE" | "URGENT" | "BUMP";

export async function boostRequest(actor: Actor, requestId: string, kind: BoostKind) {
  assertMember(actor);
  if (!(kind in BOOST_COSTS)) throw new ValidationError("Opción no válida");
  const request = await db.request.findUnique({ where: { id: requestId } });
  if (!request || request.authorId !== actor.id) throw new ForbiddenError("No puedes modificar esta solicitud");
  if (request.status !== "OPEN") throw new ConflictError("Solo puedes impulsar solicitudes abiertas");

  const now = new Date();
  let data: { featuredUntil?: Date; urgent?: boolean; bumpedAt?: Date; expiryWarned?: boolean };
  let label: string;
  if (kind === "FEATURE") {
    const base = isFeatured(request) ? request.featuredUntil! : now;
    data = { featuredUntil: new Date(base.getTime() + FEATURE_DAYS * 86400_000) };
    label = `Destacar ${FEATURE_DAYS} días`;
  } else if (kind === "URGENT") {
    if (request.urgent) throw new ConflictError("Ya está marcada como urgente");
    data = { urgent: true, bumpedAt: now, expiryWarned: false };
    label = "Marcar como urgente";
  } else {
    const hours = (now.getTime() - request.bumpedAt.getTime()) / 3600_000;
    if (hours < BUMP_COOLDOWN_HOURS) throw new ConflictError(`Podrás volver a subirla en ${Math.ceil(BUMP_COOLDOWN_HOURS - hours)} h`);
    data = { bumpedAt: now, expiryWarned: false };
    label = "Volver a subir";
  }

  await db.$transaction(async (tx) => {
    // Condicionado al estado leído: dos clics simultáneos no cobran dos veces el mismo impulso.
    const { count } = await tx.request.updateMany({
      where: { id: requestId, status: "OPEN", ...(kind === "BUMP" ? { bumpedAt: request.bumpedAt } : kind === "URGENT" ? { urgent: false } : {}) },
      data,
    });
    if (!count) throw new ConflictError("La solicitud cambió. Recarga la página.");
    await spendCredits(tx, actor.id, BOOST_COSTS[kind], kind, `${label} · ${request.title}`);
  });
}

/** El proveedor elegido marca el trabajo como entregado; empieza el plazo para confirmar o reclamar. */
export async function markDelivered(actor: Actor, requestId: string) {
  const request = await db.request.findUnique({ where: { id: requestId }, include: { acceptedOffer: { select: { providerId: true } } } });
  if (!request || request.acceptedOffer?.providerId !== actor.id) throw new NotFoundError("Solicitud no encontrada");
  const { count } = await db.request.updateMany({
    where: { id: requestId, status: "IN_PROGRESS" },
    data: { status: "DELIVERED", deliveredAt: new Date() },
  });
  if (!count) throw new ConflictError("Este trabajo no está en progreso");
  await notify(
    request.authorId,
    "Marcaron tu solicitud como entregada",
    `Confirma o reporta un problema en 72 h; si no, el pago se libera solo · ${request.title}`,
    `/solicitudes/${requestId}`,
  );
}
