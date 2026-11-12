import "server-only";
import { ForbiddenError } from "@/domain/errors";
import { isSuspended, suspendedMessage } from "@/domain/policies";
import type { Actor } from "./session";

// Reglas de autorización comunes a los servicios. Lanzan errores de negocio (mensajes seguros).

/** Las cuentas de administración operan la plataforma: no publican, no ofertan ni usan créditos o planes. */
export function assertMember(actor: Actor) {
  if (actor.role === "ADMIN") {
    throw new ForbiddenError("Las cuentas de administración no pueden publicar, ofertar ni usar créditos.");
  }
}

export function assertAdmin(actor: Actor) {
  if (actor.role !== "ADMIN") throw new ForbiddenError();
}

/** Un usuario suspendido no puede publicar, ofertar, chatear ni editar su perfil público. */
export function assertActive(actor: Actor) {
  if (isSuspended(actor)) throw new ForbiddenError(suspendedMessage(actor.suspendedUntil!));
}
