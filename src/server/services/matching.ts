import "server-only";
import { db } from "@/server/db/client";
import { ALL_ECUADOR, categoryOf } from "@/domain/catalog";
import { EARLY_ACCESS_MINUTES, planOf } from "@/domain/plans";
import { STRIKES_LOSE_PRIORITY } from "@/domain/policies";

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
 * Match instantáneo: al publicar, avisa solo a quienes declararon saber de esa categoría
 * (y, si es presencial, a quienes están en la misma ciudad). Devuelve cuántos fueron notificados.
 */
export async function notifyMatchingProviders(request: RequestForMatch) {
  const candidates = await db.user.findMany({
    where: {
      id: { not: request.authorId },
      skills: { contains: request.category },
      // Quien intenta sacar pagos de la plataforma pierde el aviso instantáneo.
      strikes: { lt: STRIKES_LOSE_PRIORITY },
      OR: [{ suspendedUntil: null }, { suspendedUntil: { lt: new Date() } }],
    },
    select: { id: true, skills: true, city: true, plan: true },
  });

  const needsSameCity = request.modality === "PRESENCIAL" && request.city !== ALL_ECUADOR;
  const matched = candidates.filter((u) => {
    // `contains` puede dar falsos positivos con subcadenas; confirmamos slug exacto.
    if (!u.skills.split(",").includes(request.category)) return false;
    if (needsSameCity) return u.city === request.city || u.city === ALL_ECUADOR;
    return true;
  });

  // Acceso anticipado: solo tiene sentido si hay algún Pro/Élite que pueda aprovecharlo;
  // si no, abrir a todos de inmediato para no hacer esperar a quien pide.
  const now = Date.now();
  const hasPremium = matched.some((u) => planOf(u.plan).earlyAccess);
  const premiumUntil = hasPremium ? new Date(now + EARLY_ACCESS_MINUTES * 60_000) : null;

  if (matched.length) {
    const cat = categoryOf(request.category);
    await db.notification.createMany({
      data: matched.map((u) => {
        // Élite primero; en urgentes, Pro 2 min después; plan gratis al terminar la ventana.
        const delay = u.plan === "ELITE" ? 0 : u.plan === "PRO" ? (request.urgent ? 2 * 60_000 : 0) : premiumUntil ? premiumUntil.getTime() - now : 0;
        return {
          userId: u.id,
          title: `${request.urgent ? "⚡ Urgente · " : ""}${cat.icon} Nueva solicitud para ti`,
          body: request.title,
          link: `/solicitudes/${request.id}`,
          visibleAt: new Date(now + delay),
        };
      }),
    });
  }

  await db.request.update({ where: { id: request.id }, data: { notifiedCount: matched.length, premiumUntil } });
  return matched.length;
}

export async function notify(userId: string, title: string, body: string, link: string) {
  await db.notification.create({ data: { userId, title, body, link } });
}

export type Reputation = { rating: number | null; reviews: number; completed: number };

export async function getReputations(userIds: string[]): Promise<Map<string, Reputation>> {
  const ids = [...new Set(userIds)];
  const [ratings, completed] = await Promise.all([
    db.review.groupBy({
      by: ["targetId"],
      where: { targetId: { in: ids } },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    db.offer.groupBy({
      by: ["providerId"],
      where: { providerId: { in: ids }, status: "ACCEPTED", request: { status: "COMPLETED" } },
      _count: { _all: true },
    }),
  ]);

  const map = new Map<string, Reputation>();
  for (const id of ids) map.set(id, { rating: null, reviews: 0, completed: 0 });
  for (const r of ratings) {
    const rep = map.get(r.targetId)!;
    rep.rating = r._avg.rating;
    rep.reviews = r._count._all;
  }
  for (const c of completed) map.get(c.providerId)!.completed = c._count._all;
  return map;
}
