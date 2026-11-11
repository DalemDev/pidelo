import "server-only";
import { env } from "@/server/config/env";
import { logger } from "@/server/infra/logger";
import { releaseDueEscrows } from "@/server/services/escrow";
import { expireStaleRequests, expireUnpaidSelections } from "./lifecycle";

// Trabajos programados: liberación automática a las 72 h, plazo de pago y vencimiento de solicitudes.
// En producción los dispara el cron (GET /api/cron/liberar). Al navegar solo corren en desarrollo
// (o con RUN_JOBS_ON_REQUEST=1), como mucho una vez por minuto por proceso y sin romper la página.

const MIN_INTERVAL_MS = 60_000;
let lastRun = 0;
let running: Promise<void> | null = null;

export async function runScheduledJobs() {
  const results = await Promise.allSettled([releaseDueEscrows(), expireStaleRequests(), expireUnpaidSelections()]);
  const failed = results.filter((r) => r.status === "rejected");
  for (const f of failed) logger.error("scheduled_job_failed", { error: (f as PromiseRejectedResult).reason });
  return { ok: failed.length === 0 };
}

/** Variante "al navegar": limitada en frecuencia, nunca lanza. */
export async function runScheduledJobsOnRequest() {
  if (process.env.NODE_ENV === "production" && env.RUN_JOBS_ON_REQUEST !== "1") return;
  if (running) return running;
  if (Date.now() - lastRun < MIN_INTERVAL_MS) return;
  lastRun = Date.now();
  running = runScheduledJobs()
    .then(() => undefined)
    .finally(() => {
      running = null;
    });
  return running;
}
