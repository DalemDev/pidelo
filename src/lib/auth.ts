import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { cache } from "react";
import { db } from "./db";

const COOKIE = "pidelo_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 días

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("SESSION_SECRET no está configurado (mínimo 32 caracteres).");
  }
  return new TextEncoder().encode(value);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE);
}

// Memoizado por request: varios componentes pueden pedir el usuario sin repetir queries.
export const getCurrentUser = cache(async () => {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.sub !== "string") return null;
    return await db.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, email: true, city: true, skills: true, bio: true, strikes: true, suspendedUntil: true, credits: true, plan: true, planRenewsAt: true, planAutoRenew: true, offerTemplate: true, role: true },
    });
  } catch {
    return null;
  }
});

// Las cuentas ADMIN operan la plataforma: no publican, no ofertan ni usan créditos o planes.
export const ADMIN_BLOCKED = "Las cuentas de administración no pueden publicar, ofertar ni usar créditos.";

export function isAdmin(user: { role: string } | null | undefined) {
  return user?.role === "ADMIN";
}

/** Para páginas de usuarios normales: el admin es enviado a su panel. */
export async function requireMember(next?: string) {
  const user = await requireUser(next);
  if (isAdmin(user)) redirect("/admin");
  return user;
}

export async function requireUser(next?: string) {
  const user = await getCurrentUser();
  if (!user) redirect(next ? `/ingresar?next=${encodeURIComponent(next)}` : "/ingresar");
  return user;
}
