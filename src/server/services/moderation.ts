import "server-only";
import { filterContact } from "@/domain/contact-filter";
import { ValidationError } from "@/domain/errors";
import { STRIKES_LOSE_PRIORITY, STRIKES_SUSPEND, SUSPENSION_DAYS } from "@/domain/policies";
import { db } from "@/server/db/client";
import { reviewContact } from "@/server/infra/ai/contact-review";
import { notify } from "./notifications";

// Anti-fuga: evita que contactos y pagos salgan de la plataforma antes de que el pago quede protegido.

export type Context = "CHAT" | "OFFER" | "REQUEST" | "PROFILE";

export type ScreenResult = {
  text: string;
  masked: boolean;
  blocked: boolean;
  detector?: "REGEX" | "PHRASE" | "AI";
  reasons: string[];
};

/** Reglas primero (rápido y gratis); IA solo cuando hay señales ambiguas. */
export async function screenText(input: string): Promise<ScreenResult> {
  const r = filterContact(input);
  if (r.blocked) return { text: input, masked: false, blocked: true, detector: "PHRASE", reasons: r.reasons };
  if (r.masked) return { text: r.text, masked: true, blocked: false, detector: "REGEX", reasons: r.reasons };

  if (r.suspicious) {
    const verdict = await reviewContact(input);
    if (verdict && (verdict.sharesContact || verdict.offPlatformPayment)) {
      return { text: input, masked: false, blocked: true, detector: "AI", reasons: [verdict.reason] };
    }
  }
  return { text: input, masked: false, blocked: false, reasons: [] };
}

export async function recordViolation(userId: string, context: Context, excerpt: string, result: ScreenResult) {
  const user = await db.user.update({
    where: { id: userId },
    data: {
      strikes: { increment: 1 },
      violations: {
        create: {
          context,
          action: result.blocked ? "BLOCKED" : "MASKED",
          detector: result.detector ?? "REGEX",
          reasons: result.reasons.join("; ").slice(0, 500),
          excerpt: excerpt.slice(0, 2000),
        },
      },
    },
    select: { strikes: true },
  });

  let consequence = "";
  if (user.strikes >= STRIKES_SUSPEND) {
    const until = new Date(Date.now() + SUSPENSION_DAYS * 86400_000);
    await db.user.update({ where: { id: userId }, data: { suspendedUntil: until } });
    consequence = ` Tu cuenta quedó suspendida ${SUSPENSION_DAYS} días.`;
  } else if (user.strikes >= STRIKES_LOSE_PRIORITY) {
    consequence = " Perdiste la prioridad en avisos y tus ofertas aparecerán al final.";
  }

  await notify(
    userId,
    `Advertencia ${user.strikes} de ${STRIKES_SUSPEND}`,
    `No compartas contactos ni acuerdes pagos por fuera antes del pago protegido.${consequence}`,
    "/actividad",
  );
  return user.strikes;
}

export function warningText(result: ScreenResult, strikes: number) {
  const base = result.blocked
    ? "No enviamos tu mensaje: parece un intento de compartir contacto o pagar por fuera de Pídelo."
    : "Ocultamos datos de contacto de tu texto.";
  return `${base} Los datos se pueden compartir cuando el pago quede protegido. Advertencia ${strikes} de ${STRIKES_SUSPEND}.`;
}

/**
 * Filtra un texto que va a ser visible para otros y registra la infracción si la hay.
 * Si se bloquea, lanza un error con la advertencia; si solo se ocultaron datos, devuelve el aviso.
 */
export async function screenOrReject(userId: string, context: Context, input: string) {
  const screened = await screenText(input);
  if (!screened.blocked && !screened.masked) return { text: screened.text, warning: undefined };
  const strikes = await recordViolation(userId, context, input, screened);
  if (screened.blocked) throw new ValidationError(warningText(screened, strikes));
  return { text: screened.text, warning: warningText(screened, strikes) };
}
