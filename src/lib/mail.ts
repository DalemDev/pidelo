import "server-only";
import { headers } from "next/headers";
import { env } from "./env";

type Mail = { to: string; subject: string; text: string; html: string };

/**
 * Envía un correo transaccional con Resend (API HTTP, sin dependencias).
 * En desarrollo, sin RESEND_API_KEY, lo imprime en la consola del servidor para poder probar los enlaces.
 */
export async function sendMail(mail: Mail) {
  if (!env.RESEND_API_KEY) {
    if (process.env.NODE_ENV === "production") throw new Error("RESEND_API_KEY no está configurada");
    console.log(`\n📧 [correo de desarrollo] Para: ${mail.to}\n   Asunto: ${mail.subject}\n${mail.text}\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
  });
  if (!res.ok) throw new Error(`Resend respondió ${res.status}: ${await res.text()}`);
}

/** URL base para los enlaces de los correos: APP_URL en producción; en desarrollo, la del request. */
export async function appUrl() {
  if (env.APP_URL) return env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
