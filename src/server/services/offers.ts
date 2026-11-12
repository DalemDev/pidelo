import "server-only";
import { ConflictError, ForbiddenError, NotFoundError } from "@/domain/errors";
import { money } from "@/domain/format";
import { planOf } from "@/domain/plans";
import { offerCost } from "@/domain/policies";
import type { OfferInput } from "@/domain/schemas";
import { assertActive, assertMember } from "@/server/auth/guards";
import type { Actor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { LIMITS, consume } from "@/server/infra/rate-limit";
import { spendCredits } from "./credits";
import { screenOrReject } from "./moderation";
import { notify } from "./notifications";

// Ofertas de proveedores sobre una solicitud. Ofertar cuesta créditos (se devuelven si la solicitud
// se cancela o vence sin elegir).

/** Envía (o reenvía, si la había retirado) una oferta. Devuelve un aviso si se ocultaron datos de contacto. */
export async function createOffer(actor: Actor, requestId: string, input: OfferInput, saveTemplate: boolean) {
  assertMember(actor);
  assertActive(actor);

  const request = await db.request.findUnique({ where: { id: requestId } });
  if (!request || request.status !== "OPEN") throw new ConflictError("Esta solicitud ya no recibe ofertas");
  if (request.authorId === actor.id) throw new ForbiddenError("No puedes ofertar en tu propia solicitud");
  if (request.premiumUntil && request.premiumUntil > new Date() && !planOf(actor.plan).earlyAccess) {
    throw new ForbiddenError("Esta solicitud está en acceso anticipado para Pro y Élite. Podrás ofertar en unos minutos.");
  }
  const existing = await db.offer.findUnique({ where: { requestId_providerId: { requestId, providerId: actor.id } } });
  if (existing && existing.status !== "WITHDRAWN") throw new ConflictError("Ya enviaste una oferta");

  await consume(LIMITS.offer(actor.id), (m) => `Enviaste muchas ofertas seguidas. Intenta de nuevo en ${m} min.`);
  const { text: message, warning } = await screenOrReject(actor.id, "OFFER", input.message);
  const cost = offerCost(request.budgetMin, request.budgetMax);
  const data = { price: input.price, deliveryDays: input.deliveryDays, message, creditsSpent: cost };

  const offer = await db.$transaction(async (tx) => {
    await spendCredits(tx, actor.id, cost, "OFFER", `Oferta · ${request.title}`);
    if (!existing) return tx.offer.create({ data: { ...data, requestId, providerId: actor.id } });
    // Reenvío: solo si sigue retirada (dos envíos simultáneos no pueden cobrar dos veces).
    const { count } = await tx.offer.updateMany({ where: { id: existing.id, status: "WITHDRAWN" }, data: { ...data, status: "PENDING" } });
    if (!count) throw new ConflictError("Ya enviaste una oferta");
    return tx.offer.findUniqueOrThrow({ where: { id: existing.id } });
  });

  // Beneficio Pro/Élite: guardar el mensaje como plantilla para próximas ofertas.
  if (saveTemplate && planOf(actor.plan).earlyAccess) {
    await db.user.update({ where: { id: actor.id }, data: { offerTemplate: message } });
  }
  await notify(request.authorId, `Nueva oferta de ${actor.name}`, `${money(offer.price)} · ${request.title}`, `/solicitudes/${requestId}#oferta-${offer.id}`);
  return { offer, warning };
}

/** Retirar una oferta pendiente. Los créditos no se devuelven: pagaron la oportunidad de competir. */
export async function withdrawOffer(actor: Actor, offerId: string) {
  const offer = await db.offer.findUnique({ where: { id: offerId }, select: { providerId: true, requestId: true } });
  if (!offer || offer.providerId !== actor.id) throw new NotFoundError("Oferta no encontrada");
  const { count } = await db.offer.updateMany({ where: { id: offerId, status: "PENDING" }, data: { status: "WITHDRAWN" } });
  if (!count) throw new ConflictError("Esta oferta ya no se puede retirar");
  return offer.requestId;
}
