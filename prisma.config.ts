import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Las migraciones necesitan una conexión directa (sin pooler). En Neon/Supabase usa DIRECT_URL
    // para esto y deja DATABASE_URL con la URL "pooled" para la app; en local basta con DATABASE_URL.
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
