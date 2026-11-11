import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Pruebas unitarias (tests/unit: reglas puras, sin base de datos) e integración (tests/integration:
// servicios contra un PostgreSQL de prueba indicado en TEST_DATABASE_URL; se omiten si no está).
const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      // "server-only" solo tiene sentido dentro de Next.js; en pruebas es un módulo vacío.
      "server-only": path.resolve(root, "tests/stubs/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    globalSetup: ["tests/global-setup.ts"],
    // Las pruebas de integración comparten una base: se ejecutan en serie.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
