import { db } from "@/lib/db";

// Para monitoreo (UptimeRobot, Better Stack…): 200 si la app y la base de datos responden.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, db: "ok" });
  } catch {
    return Response.json({ ok: false, db: "error" }, { status: 503 });
  }
}
