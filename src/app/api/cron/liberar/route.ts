import { safeEqual } from "@/server/infra/crypto";
import { runScheduledJobs } from "@/server/jobs/scheduler";

// Tareas programadas (Vercel Cron cada hora, ver vercel.json): liberación automática de pagos a las 72 h,
// plazo de pago de 48 h y vencimiento de solicitudes abandonadas (14 días, con devolución de créditos).
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return new Response("No autorizado", { status: 401 });
  }
  const { ok } = await runScheduledJobs();
  return Response.json({ ok }, { status: ok ? 200 : 500 });
}
