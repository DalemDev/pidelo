import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "@/server/config/env";

// Comprobantes de pago. Nunca se sirven desde /public: solo vía /api/comprobantes/[id] con control de acceso.
// - STORAGE_DRIVER=local: disco en ./storage/receipts (solo desarrollo; en serverless el disco no persiste).
// - STORAGE_DRIVER=s3: bucket privado S3 o Cloudflare R2 (S3_ENDPOINT para R2).

const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const NAME_RE = /^[a-z0-9]+-\d+\.(jpg|png|webp|pdf)$/;

export class UploadError extends Error {}

// Firma de los primeros bytes: el tipo que declara el navegador se puede falsificar.
function sniff(buf: Buffer): string | null {
  if (buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  return null;
}

// ---------------------------------------------------------------------------
// Drivers

interface Driver {
  put(name: string, data: Buffer, type: string): Promise<void>;
  get(name: string): Promise<Buffer>;
}

const localDriver = (): Driver => {
  const root = path.join(process.cwd(), "storage", "receipts");
  return {
    async put(name, data) {
      await mkdir(root, { recursive: true });
      await writeFile(path.join(root, name), data);
    },
    get: (name) => readFile(path.join(root, name)),
  };
};

const s3Driver = (): Driver => {
  if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    throw new Error("STORAGE_DRIVER=s3 requiere S3_BUCKET, S3_ACCESS_KEY_ID y S3_SECRET_ACCESS_KEY");
  }
  const client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  });
  const Bucket = env.S3_BUCKET;
  const key = (name: string) => `receipts/${name}`;
  return {
    async put(name, data, type) {
      await client.send(new PutObjectCommand({ Bucket, Key: key(name), Body: data, ContentType: type }));
    },
    async get(name) {
      const out = await client.send(new GetObjectCommand({ Bucket, Key: key(name) }));
      if (!out.Body) throw new UploadError("Archivo vacío");
      return Buffer.from(await out.Body.transformToByteArray());
    },
  };
};

let driver: Driver | null = null;
const storage = () => (driver ??= env.STORAGE_DRIVER === "s3" ? s3Driver() : localDriver());

// ---------------------------------------------------------------------------
// API

export async function saveReceipt(file: File, paymentId: string) {
  const ext = TYPES[file.type];
  if (!ext) throw new UploadError("Sube una imagen (JPG, PNG, WEBP) o un PDF");
  if (file.size > MAX_RECEIPT_BYTES) throw new UploadError("El archivo supera los 5 MB");
  const data = Buffer.from(await file.arrayBuffer());
  if (sniff(data) !== file.type) throw new UploadError("El archivo no parece una imagen o PDF válido");
  // El nombre lo decide el servidor (id + timestamp): nunca se usa el nombre que envía el cliente.
  const name = `${paymentId}-${Date.now()}.${ext}`;
  await storage().put(name, data, file.type);
  return name;
}

export async function readReceipt(name: string) {
  // Defensa ante path traversal: solo nombres simples generados por saveReceipt.
  if (!NAME_RE.test(name)) throw new UploadError("Nombre inválido");
  const ext = name.split(".").pop()!;
  const type = Object.entries(TYPES).find(([, e]) => e === ext)![0];
  return { data: await storage().get(name), type };
}
