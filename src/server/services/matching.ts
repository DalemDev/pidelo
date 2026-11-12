import "server-only";
import { ALL_ECUADOR, categoryOf } from "@/domain/catalog";
import { EARLY_ACCESS_MINUTES, planOf } from "@/domain/plans";
import { STRIKES_LOSE_PRIORITY } from "@/domain/policies";
import { db } from "@/server/db/client";
import { notifyScheduled } from "./notifications";

// Tope de avisos por solicitud: acota el costo de publicar y evita inundar bandejas. Se priorizan
// planes pagados y luego quienes tienen menos advertencias; el resto la encuentra en el listado.
const MAX_NOTIFIED = 200;

type RequestForMatch = {
  id: string;
  title: string;
  category: string;
  modality: string;
  city: string;
  urgent: boolean;
  authorId: string;
};

/**
 * Match instantáneo: al publicar, avisa a quienes declararon saber de esa categoría
 * (y, si es presencial, a quienes están en la misma ciudad). Devuelve cuántos fueron notificados.
 */
export async function notifyMatchingProviders(request: RequestForMatch) {
  const needsSameCity = request.modality === "PRESENCIAL" && request.city !== ALL_ECUADOR;
  const candidates = await db.user.findMany({
    where: {
      id: { not: request.authorId },
      role: "USER",
      deletedAt: null,
      skills: { contains: request.category },
      // Quien intenta sacar pagos de la plataforma pierde el aviso instantáneo.
      strikes: { lt: STRIKES_LOSE_PRIORITY },
      OR: [{ suspendedUntil: null }, { suspendedUntil: { lt: new Date() } }],
      ...(needsSameCity ? { city: { in: [request.city, ALL_ECUADOR] } } : {}),
    },
    select: { id: true, skills: true, plan: true },
    orderBy: [{ strikes: "asc" }, { createdAt: "asc" }],
    take: MAX_NOTIFIED * 5,
  });

  // `contains` puede dar falsos positivos con subcadenas; se confirma el slug exacto.
  // Orden estable por prioridad del plan (Élite, Pro, Gratis), manteniendo el orden por advertencias.
  const matched = candidates
    .filter((u) => u.skills.split(",").includes(request.category))
    .sort((a, b) => planOf(b.plan).priority - planOf(a.plan).priority)
    .slice(0, MAX_NOTIFIED);

  // Acceso anticipado: solo tiene sentido si hay algún Pro/Élite que pueda aprovecharlo;
  // si no, se abre a todos de inmediato para no hacer esperar a quien pide.
  const now = Date.now();
  const hasPremium = matched.some((u) => planOf(u.plan).earlyAccess);
  const premiumUntil = hasPremium ? new Date(now + EARLY_ACCESS_MINUTES * 60_000) : null;

  const cat = categoryOf(request.category);
  await notifyScheduled(
    matched.map((u) => {
      // Élite primero; en urgentes, Pro 2 min después; plan gratis al terminar la ventana.
      const delay =
        u.plan === "ELITE" ? 0 : u.plan === "PRO" ? (request.urgent ? 2 * 60_000 : 0) : premiumUntil ? premiumUntil.getTime() - now : 0;
      return {
        userId: u.id,
        title: `${request.urgent ? "Urgente: " : ""}nueva solicitud de ${cat.label.toLowerCase()}`,
        body: request.title,
        link: `/solicitudes/${request.id}`,
        visibleAt: new Date(now + delay),
      };
    }),
  );

  await db.request.update({ where: { id: request.id }, data: { notifiedCount: matched.length, premiumUntil } });
  return matched.length;
}
