// Variables de entorno validadas. (Sin "server-only": también lo importa instrumentation.ts.)
import { z } from "zod";

const optional = z.string().trim().min(1).optional().catch(undefined);

const schema = z.object({
  DATABASE_URL: z
    .string({ error: "DATABASE_URL es obligatoria (cadena de conexión de PostgreSQL)" })
    .regex(/^postgres(ql)?:\/\//, "DATABASE_URL debe ser una URL postgresql://"),
  SESSION_SECRET: optional,
  CRON_SECRET: optional,
  ANTHROPIC_API_KEY: optional,
  // URL pública de la app (p. ej. https://pidelo.ec), para los enlaces de los correos.
  APP_URL: optional,
  // Correo transaccional con Resend (recuperación de contraseña). Sin clave, en desarrollo se imprime en consola.
  RESEND_API_KEY: optional,
  MAIL_FROM: optional,
  // Clave de 32 bytes en base64 para cifrar datos bancarios y de identidad en la base.
  // Generar con: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  DATA_ENCRYPTION_KEY: optional,
  // Datos de la empresa que se muestran en el pie de página y en los documentos legales.
  LEGAL_COMPANY_NAME: optional,
  LEGAL_RUC: optional,
  LEGAL_ADDRESS: optional,
  SUPPORT_EMAIL: optional,
  PRIVACY_EMAIL: optional,
  // "1" ejecuta los trabajos programados al navegar también en producción (si no hay cron disponible).
  RUN_JOBS_ON_REQUEST: optional,
  // "1" permite compras con tarjeta simuladas en producción (solo para un demo; nunca con usuarios reales).
  ALLOW_SIMULATED_PAYMENTS: optional,

  // Almacenamiento de comprobantes: disco local (solo desarrollo) o S3 compatible (S3, Cloudflare R2).
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  S3_BUCKET: optional,
  S3_REGION: z.string().default("auto"),
  S3_ENDPOINT: optional,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,

  // Cuenta de la empresa para cobros por transferencia/DeUna.
  PAY_BANK_NAME: optional,
  PAY_ACCOUNT_TYPE: optional,
  PAY_ACCOUNT_NUMBER: optional,
  PAY_HOLDER: optional,
  PAY_RUC: optional,
  PAY_DEUNA: optional,
});

export type Env = z.infer<typeof schema>;

function parse(): Env {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Variables de entorno inválidas:\n${issues}`);
  }
  return result.data;
}

export const env = parse();

/**
 * Sin pasarela integrada, "pagar con tarjeta" no cobra nada: solo se permite en desarrollo
 * o si se habilita a propósito. En producción, créditos y planes se pagan con el saldo de la billetera.
 */
export function simulatedPaymentsEnabled(e: Env = env) {
  return process.env.NODE_ENV !== "production" || e.ALLOW_SIMULATED_PAYMENTS === "1";
}

/**
 * Requisitos adicionales de producción. Se ejecuta al arrancar el servidor (instrumentation.ts),
 * no durante el build, para que un despliegue mal configurado falle de inmediato y con un mensaje claro.
 */
export function assertProductionEnv(e: Env = env) {
  const missing: string[] = [];
  if (!e.SESSION_SECRET || e.SESSION_SECRET.length < 32) missing.push("SESSION_SECRET (mínimo 32 caracteres)");
  if (!e.CRON_SECRET) missing.push("CRON_SECRET");
  if (e.STORAGE_DRIVER !== "s3") missing.push('STORAGE_DRIVER="s3" (el disco de un servidor serverless no persiste)');
  for (const k of ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) if (!e[k]) missing.push(k);
  for (const k of ["PAY_BANK_NAME", "PAY_ACCOUNT_NUMBER", "PAY_HOLDER", "PAY_RUC"] as const) if (!e[k]) missing.push(k);
  // Sin correo no hay recuperación de contraseña.
  for (const k of ["APP_URL", "RESEND_API_KEY", "MAIL_FROM"] as const) if (!e[k]) missing.push(k);
  if (!e.DATA_ENCRYPTION_KEY || Buffer.from(e.DATA_ENCRYPTION_KEY, "base64").length !== 32) {
    missing.push("DATA_ENCRYPTION_KEY (32 bytes en base64)");
  }
  // Identificación del proveedor del servicio (Ley de Comercio Electrónico y Defensa del Consumidor).
  for (const k of ["LEGAL_COMPANY_NAME", "LEGAL_RUC", "LEGAL_ADDRESS", "SUPPORT_EMAIL", "PRIVACY_EMAIL"] as const) {
    if (!e[k]) missing.push(k);
  }
  if (missing.length) {
    throw new Error(`Faltan variables de entorno para producción:\n${missing.map((m) => `  - ${m}`).join("\n")}\nVer README → "Publicar en producción".`);
  }
}
