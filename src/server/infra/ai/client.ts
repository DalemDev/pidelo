import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Cliente compartido de la API de Claude. Sin credenciales, las funciones de IA usan su alternativa local.

export const AI_MODEL = "claude-opus-5-5";

// Fallback del lado del servidor: si el modelo declina, la API reintenta en otro modelo dentro de la misma llamada.
export function fallbackParams() {
  return { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };
}

let client: Anthropic | null = null;

export function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** Cliente con timeout corto: estas llamadas están en el camino del usuario y tienen alternativa local. */
export function ai() {
  return (client ??= new Anthropic({ timeout: 20_000, maxRetries: 1 }));
}

/** Envuelve texto del usuario para que el modelo lo trate como datos, no como instrucciones. */
export function asUserData(text: string) {
  // Se neutraliza un posible cierre de etiqueta dentro del texto.
  return `<texto_usuario>\n${text.replaceAll("</texto_usuario>", "</texto_usuario_>")}\n</texto_usuario>`;
}
