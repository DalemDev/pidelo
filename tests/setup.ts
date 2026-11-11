import { vi } from "vitest";

// Las pruebas de integración usan una base dedicada: nunca la de desarrollo.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL ??= "postgresql://sin-base/para-pruebas-unitarias";
process.env.SESSION_SECRET ??= "secreto-de-pruebas-con-mas-de-32-caracteres";

// Fuera de un request de Next.js no hay cabeceras ni cookies.
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "203.0.113.7" }),
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
}));
