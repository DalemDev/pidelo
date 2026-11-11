import { AppError } from "@/domain/errors";
import { getCurrentUser } from "@/server/auth/session";
import { readReceipt } from "@/server/infra/storage";
import { receiptFor } from "@/server/services/payments";

// Sirve el comprobante solo a quien pagó o a un admin (nunca desde /public). Se entrega como descarga y
// con una CSP de sandbox: un PDF o imagen manipulado no puede ejecutar nada en el origen de la app.
export async function GET(_: Request, ctx: RouteContext<"/api/comprobantes/[id]">) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("No autorizado", { status: 401 });
  try {
    const { data, type } = await readReceipt(await receiptFor(user, id));
    const ext = type === "application/pdf" ? "pdf" : type.split("/")[1];
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": type,
        "Content-Disposition": `attachment; filename="comprobante-${id}.${ext}"`,
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    // Mismo 404 si no existe o no le pertenece: no se revela qué ids existen.
    if (error instanceof AppError || error instanceof Error) return new Response("No encontrado", { status: 404 });
    throw error;
  }
}
