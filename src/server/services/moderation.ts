import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { db } from "@/server/db/client";
import { filterContact } from "@/domain/contact-filter";
import { notify } from "@/server/services/matching";
import { STRIKES_LOSE_PRIORITY, STRIKES_SUSPEND } from "@/domain/policies";

export type Context = "CHAT" | "OFFER" | "REQUEST";

export type ScreenResult = {
  text: string;
  masked: boolean;
  blocked: boolean;
  detector?: "REGEX" | "PHRASE" | "AI";
  reasons: string[];
};

const VerdictSchema = z.object({
  sharesContact: z.boolean().describe("Intenta compartir o pedir un medio de contacto fuera de la plataforma"),
  offPlatformPayment: z.boolean().describe("Propone pagar o cobrar fuera de la plataforma"),
  reason: z.string().describe("Explicación breve en español"),
});

const SYSTEM = `Eres el moderador de Pídelo, un marketplace de Ecuador. Antes de que el pago quede protegido, las personas no pueden compartir datos de contacto ni acordar pagos por fuera de la plataforma.

Analiza el texto y marca:
- sharesContact: si comparte o pide teléfono, correo, redes sociales, usuario, enlace, dirección exacta, o indica cómo encontrarse fuera (ej. "búscame en Facebook como…", "mi número está en mi perfil", números separados o disfrazados, emojis en lugar de dígitos).
- offPlatformPayment: si propone pagar o cobrar por transferencia directa, efectivo, DeUna, depósito, o evitar la comisión.

No marques: precios, fechas, horarios, duraciones, cantidades, ni menciones a redes sociales o WhatsApp como tema del trabajo (ej. "necesito un bot de WhatsApp", "manejo de Instagram para mi negocio").`;

let client: Anthropic | null = null;

async function aiReview(text: string) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  client ??= new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model: "claude-opus-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(VerdictSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: text }],
    });
    if (response.stop_reason === "refusal") return null;
    return response.parsed_output;
  } catch (error) {
    // Si la IA falla no bloqueamos la conversación: el filtro por reglas ya actuó.
    if (error instanceof Anthropic.APIError) console.error(`Moderación IA no disponible (${error.status})`);
    else console.error("Moderación IA no disponible:", error);
    return null;
  }
}

/** Reglas primero (rápido y gratis); IA solo cuando hay señales ambiguas. */
export async function screenText(input: string): Promise<ScreenResult> {
  const r = filterContact(input);
  if (r.blocked) return { text: input, masked: false, blocked: true, detector: "PHRASE", reasons: r.reasons };
  if (r.masked) return { text: r.text, masked: true, blocked: false, detector: "REGEX", reasons: r.reasons };

  if (r.suspicious) {
    const verdict = await aiReview(input);
    if (verdict && (verdict.sharesContact || verdict.offPlatformPayment)) {
      return { text: input, masked: false, blocked: true, detector: "AI", reasons: [verdict.reason] };
    }
  }
  return { text: input, masked: false, blocked: false, reasons: [] };
}

// ---------------------------------------------------------------------------
// Strikes

const SUSPENSION_DAYS = 7;

export function isSuspended(user: { suspendedUntil: Date | null }) {
  return !!user.suspendedUntil && user.suspendedUntil > new Date();
}

export function suspendedMessage(until: Date) {
  return `Tu cuenta está suspendida hasta el ${until.toLocaleDateString("es-EC", { day: "numeric", month: "long" })} por intentar sacar pagos o contactos de la plataforma.`;
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
          reasons: result.reasons.join("; "),
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
    `⚠️ Advertencia ${user.strikes} de ${STRIKES_SUSPEND}`,
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
