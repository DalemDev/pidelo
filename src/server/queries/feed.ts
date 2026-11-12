import type { Prisma } from "@/generated/prisma/client";
import { planOf } from "@/domain/plans";

/** Filtro de acceso anticipado: el plan gratis (y visitantes) no ven solicitudes aún reservadas para Pro/Élite. */
export function earlyAccessFilter(viewer: { id: string; plan: string } | null): Prisma.RequestWhereInput {
  if (viewer && planOf(viewer.plan).earlyAccess) return {};
  const open: Prisma.RequestWhereInput[] = [{ premiumUntil: null }, { premiumUntil: { lte: new Date() } }];
  if (viewer) open.push({ authorId: viewer.id });
  return { OR: open };
}

type Sortable = { featuredUntil: Date | null; urgent: boolean; bumpedAt: Date };

/** Destacadas primero, luego urgentes, luego las más recientes o recién subidas. */
export function sortFeed<T extends Sortable>(requests: T[]) {
  const now = new Date();
  return [...requests].sort((a, b) => {
    const fa = a.featuredUntil && a.featuredUntil > now ? 1 : 0;
    const fb = b.featuredUntil && b.featuredUntil > now ? 1 : 0;
    if (fa !== fb) return fb - fa;
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    return b.bumpedAt.getTime() - a.bumpedAt.getTime();
  });
}
