import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@/server/config/env";

// Reutiliza el cliente entre recargas en desarrollo para no abrir conexiones de más.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  // En serverless (Vercel) usa la URL con pooling del proveedor (Neon/Supabase "pooled").
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
