import { getCurrentUser } from "@/server/auth/session";
import { exportPersonalData } from "@/server/services/accounts";

// Derecho de acceso y portabilidad (LOPDP): descarga de los datos personales del usuario en JSON.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("No autorizado", { status: 401 });
  const data = await exportPersonalData(user);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="pidelo-mis-datos-${date}.json"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
