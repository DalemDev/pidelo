import { describe } from "vitest";
import { db } from "@/server/db/client";
import type { Actor } from "@/server/auth/session";

/** Las pruebas de integración solo corren con una base de prueba configurada. */
export const describeDb = describe.skipIf(!process.env.TEST_DATABASE_URL);

let n = 0;

/** Crea un usuario y devuelve el Actor que reciben los servicios. */
export async function makeUser(overrides: Partial<{ role: string; credits: number; plan: string; name: string }> = {}): Promise<Actor> {
  n++;
  const u = await db.user.create({
    data: {
      name: overrides.name ?? `Usuario ${n}`,
      email: `u${n}-${Date.now()}@test.ec`,
      passwordHash: "x",
      role: overrides.role ?? "USER",
      credits: overrides.credits ?? 0,
      plan: overrides.plan ?? "FREE",
    },
  });
  return {
    id: u.id, name: u.name, email: u.email, city: u.city, skills: u.skills, bio: u.bio, strikes: u.strikes,
    suspendedUntil: u.suspendedUntil, credits: u.credits, plan: u.plan, planRenewsAt: u.planRenewsAt,
    planAutoRenew: u.planAutoRenew, nextPlan: u.nextPlan, offerTemplate: u.offerTemplate, role: u.role,
  };
}

/** Solicitud con una oferta, lista para elegir. */
export async function makeRequestWithOffer(client: Actor, provider: Actor, opts: { price?: number; creditsSpent?: number } = {}) {
  const request = await db.request.create({
    data: { title: "Solicitud de prueba", description: "Descripción de prueba suficientemente larga", category: "otros", authorId: client.id },
  });
  const offer = await db.offer.create({
    data: { price: opts.price ?? 50, deliveryDays: 2, message: "Oferta de prueba", creditsSpent: opts.creditsSpent ?? 0, requestId: request.id, providerId: provider.id },
  });
  return { request, offer };
}
