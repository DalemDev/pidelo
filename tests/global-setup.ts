import { execSync } from "node:child_process";

// Aplica las migraciones a la base de pruebas (no borra datos: cada prueba crea los suyos con ids únicos).
// En CI la base es nueva en cada ejecución; en local, crea una base dedicada (ver README → Pruebas).
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.warn("TEST_DATABASE_URL no está definida: se omiten las pruebas de integración.");
    return;
  }
  if (!/test/i.test(new URL(url).pathname)) {
    throw new Error("TEST_DATABASE_URL debe apuntar a una base dedicada cuyo nombre contenga 'test' (p. ej. pidelo_test).");
  }
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });
}
