import "server-only";
import { db } from "@/server/db/client";

export type Reputation = { rating: number | null; reviews: number; completed: number };

/** Promedio de calificaciones, cantidad de reseñas y trabajos completados de varios usuarios a la vez. */
export async function getReputations(userIds: string[]): Promise<Map<string, Reputation>> {
  const ids = [...new Set(userIds)];
  const map = new Map<string, Reputation>();
  for (const id of ids) map.set(id, { rating: null, reviews: 0, completed: 0 });
  if (!ids.length) return map;

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

  for (const r of ratings) {
    const rep = map.get(r.targetId)!;
    rep.rating = r._avg.rating;
    rep.reviews = r._count._all;
  }
  for (const c of completed) map.get(c.providerId)!.completed = c._count._all;
  return map;
}
