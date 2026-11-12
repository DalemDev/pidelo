// Se ejecuta una vez al arrancar el servidor. En producción, detiene el arranque si falta configuración.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production" && process.env.SKIP_ENV_CHECK !== "1") {
    const { assertProductionEnv } = await import("./server/config/env");
    assertProductionEnv();
  }
}
