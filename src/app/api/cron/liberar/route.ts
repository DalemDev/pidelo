import { releaseDueEscrows } from "@/server/services/escrow";
import { expireStaleRequests, expireUnpaidSelections } from "@/server/jobs/lifecycle";

// Tareas programadas (p. ej. Vercel Cron cada hora): liberación automática de pagos a las 72 h y
// vencimiento de solicitudes abandonadas (14 días, con devolución de créditos). Lo "al navegar"
// del navbar sigue funcionando; esto garantiza que ocurra aunque nadie entre a la app.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("No autorizado", { status: 401 });
  }
  await Promise.all([releaseDueEscrows(), expireStaleRequests(), expireUnpaidSelections()]);
  return Response.json({ ok: true });
}
