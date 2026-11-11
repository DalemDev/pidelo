import "server-only";
import { NotFoundError } from "@/domain/errors";
import { contactUnlocked } from "@/domain/policies";
import { assertActive } from "@/server/auth/guards";
import type { Actor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { LIMITS, consume } from "@/server/infra/rate-limit";
import { screenOrReject } from "./moderation";
import { notify } from "./notifications";

// Chat privado por oferta, entre quien pide y quien ofertó.

/** Hilo de una oferta, solo si el usuario participa en él. */
export async function loadThread(userId: string, offerId: string) {
  const offer = await db.offer.findUnique({ where: { id: offerId }, include: { request: true } });
  if (!offer || ![offer.providerId, offer.request.authorId].includes(userId)) return null;
  return offer;
}

/** Envía un mensaje. Antes del pago protegido se filtran contactos; después pueden coordinar libremente. */
export async function sendMessage(actor: Actor, offerId: string, body: string) {
  const offer = await loadThread(actor.id, offerId);
  if (!offer) throw new NotFoundError("No tienes acceso a esta conversación");
  assertActive(actor);
  await consume(LIMITS.message(actor.id), () => "Estás enviando mensajes muy rápido. Espera un momento.");

  let text = body;
  let warning: string | undefined;
  let masked = false;
  if (!contactUnlocked(offer.request, offer.id)) {
    ({ text, warning } = await screenOrReject(actor.id, "CHAT", body));
    masked = text !== body;
  }

  await db.message.create({ data: { offerId, senderId: actor.id, body: text, masked } });
  const recipient = actor.id === offer.providerId ? offer.request.authorId : offer.providerId;
  await notify(recipient, `Mensaje de ${actor.name}`, text.slice(0, 120), `/solicitudes/${offer.requestId}/chat/${offerId}`);
  return { requestId: offer.requestId, warning };
}
