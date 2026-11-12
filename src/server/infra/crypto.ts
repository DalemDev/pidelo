import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/server/config/env";

// Cifrado de campos sensibles en reposo (número de cuenta, cédula/RUC). AES-256-GCM con IV aleatorio:
// formato "enc:v1:<iv>:<tag>:<datos>" en base64url. El prefijo de versión permite rotar el algoritmo.

const PREFIX = "enc:v1:";

let cachedKey: Buffer | null = null;

function key() {
  if (cachedKey) return cachedKey;
  if (env.DATA_ENCRYPTION_KEY) {
    const k = Buffer.from(env.DATA_ENCRYPTION_KEY, "base64");
    if (k.length !== 32) throw new Error("DATA_ENCRYPTION_KEY debe tener 32 bytes en base64");
    return (cachedKey = k);
  }
  if (process.env.NODE_ENV === "production") throw new Error("DATA_ENCRYPTION_KEY no está configurada");
  // Solo desarrollo: clave derivada del secreto de sesión para no exigir otra variable.
  return (cachedKey = createHash("sha256").update(`dev-data-key:${env.SESSION_SECRET ?? "dev"}`).digest());
}

export function encrypt(plain: string): string;
export function encrypt(plain: string | null): string | null;
export function encrypt(plain: string | null) {
  if (plain == null || plain === "") return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(":");
}

/** Descifra; los valores antiguos guardados sin cifrar se devuelven tal cual. */
export function decrypt(value: string): string;
export function decrypt(value: string | null): string | null;
export function decrypt(value: string | null) {
  if (value == null || !value.startsWith(PREFIX)) return value;
  const [iv, tag, data] = value.slice(PREFIX.length).split(":").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv!);
  decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(data!), decipher.final()]).toString("utf8");
}

/** Muestra solo los últimos 4 dígitos (para pantallas que no necesitan el número completo). */
export function maskTail(value: string | null) {
  if (!value) return "";
  return `•••• ${value.slice(-4)}`;
}

/** Comparación en tiempo constante para secretos (evita ataques por tiempo de respuesta). */
export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
