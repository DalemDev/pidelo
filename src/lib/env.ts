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
  if (missing.length) {
    throw new Error(`Faltan variables de entorno para producción:\n${missing.map((m) => `  - ${m}`).join("\n")}\nVer README → "Publicar en producción".`);
  }
}
