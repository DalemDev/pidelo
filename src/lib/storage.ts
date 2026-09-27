import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Fase 1: disco local, fuera de /public (los comprobantes solo se sirven con control de acceso).
// En producción serverless el disco no persiste: migrar a S3/Cloudflare R2 (ver README).
const ROOT = path.join(process.cwd(), "storage", "receipts");

const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

export class UploadError extends Error {}

export async function saveReceipt(file: File, paymentId: string) {
  const ext = TYPES[file.type];
  if (!ext) throw new UploadError("Sube una imagen (JPG, PNG, WEBP) o un PDF");
  if (file.size > MAX_RECEIPT_BYTES) throw new UploadError("El archivo supera los 5 MB");
  await mkdir(ROOT, { recursive: true });
  // El nombre lo decide el servidor (id + timestamp): nunca se usa el nombre que envía el cliente.
  const name = `${paymentId}-${Date.now()}.${ext}`;
  await writeFile(path.join(ROOT, name), Buffer.from(await file.arrayBuffer()));
  return name;
}

export async function readReceipt(name: string) {
  // Defensa ante path traversal: solo nombres simples generados por saveReceipt.
  if (!/^[a-z0-9]+-\d+\.(jpg|png|webp|pdf)$/.test(name)) throw new UploadError("Nombre inválido");
  const ext = name.split(".").pop()!;
  const type = Object.entries(TYPES).find(([, e]) => e === ext)![0];
  return { data: await readFile(path.join(ROOT, name)), type };
}
