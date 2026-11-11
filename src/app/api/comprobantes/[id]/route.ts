import { db } from "@/server/db/client";
import { getCurrentUser } from "@/server/auth/session";
import { readReceipt } from "@/server/infra/storage";

// Sirve el comprobante solo a quien pagó o a un admin (nunca desde /public).
export async function GET(_: Request, ctx: RouteContext<"/api/comprobantes/[id]">) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("No autorizado", { status: 401 });

  const payment = await db.payment.findUnique({ where: { id }, select: { payerId: true, receiptPath: true } });
  if (!payment?.receiptPath || (payment.payerId !== user.id && user.role !== "ADMIN")) {
    return new Response("No encontrado", { status: 404 });
  }
  try {
    const { data, type } = await readReceipt(payment.receiptPath);
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return new Response("No encontrado", { status: 404 });
  }
}
