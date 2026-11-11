import "server-only";
import { ConflictError, ForbiddenError } from "@/domain/errors";
import type { ReviewInput } from "@/domain/schemas";
import type { Actor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { notify } from "./notifications";

// Reseñas mutuas al terminar un trabajo: cliente califica al proveedor y viceversa, una vez cada uno.

export async function leaveReview(actor: Actor, requestId: string, input: ReviewInput) {
  const request = await db.request.findUnique({ where: { id: requestId }, include: { acceptedOffer: { select: { providerId: true } } } });
  if (!request || request.status !== "COMPLETED" || !request.acceptedOffer) {
    throw new ConflictError("Solo puedes calificar trabajos completados");
  }
  const providerId = request.acceptedOffer.providerId;
  let targetId: string;
  if (actor.id === request.authorId) targetId = providerId;
  else if (actor.id === providerId) targetId = request.authorId;
  else throw new ForbiddenError("No participaste en este trabajo");

  try {
    await db.review.create({ data: { ...input, requestId, authorId: actor.id, targetId } });
  } catch (error) {
    // La restricción única (requestId, authorId) protege ante envíos simultáneos.
    if ((error as { code?: string }).code === "P2002") throw new ConflictError("Ya calificaste este trabajo");
    throw error;
  }
  await notify(targetId, `${actor.name} te calificó con ${input.rating}/5`, request.title, `/perfil/${targetId}`);
}
