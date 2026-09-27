import { releaseDueEscrows } from "@/lib/escrow";

// Liberación automática programada (p. ej. Vercel Cron cada hora). La liberación "al navegar"
// del navbar sigue funcionando; esto garantiza que ocurra aunque nadie entre a la app.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("No autorizado", { status: 401 });
  }
  await releaseDueEscrows();
  return Response.json({ ok: true });
}
