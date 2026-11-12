import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { cache } from "react";
import { db } from "@/server/db/client";
import type { Tx } from "@/server/db/client";

// Sesiones: la cookie (httpOnly, Secure, SameSite=Lax) lleva un JWT firmado con el id de una fila de
// Session. Validar la fila en cada request permite revocar: cerrar sesión, cambio de contraseña o baja.

const COOKIE = "pidelo_session";
const SESSION_DAYS = 30;
const MAX_AGE = SESSION_DAYS * 86400;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("SESSION_SECRET no está configurado (mínimo 32 caracteres).");
  }
  return new TextEncoder().encode(value);
}

export async function createSession(userId: string) {
  const expiresAt = new Date(Date.now() + MAX_AGE * 1000);
  const session = await db.session.create({ data: { userId, expiresAt } });
  const token = await new SignJWT({ sub: userId, sid: session.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
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

async function readToken() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string") return null;
    return { userId: payload.sub, sessionId: payload.sid };
  } catch {
    return null;
  }
}

/** Cierra la sesión actual: se revoca en la base (el token deja de valer aunque alguien lo haya copiado). */
export async function destroySession() {
  const token = await readToken();
  if (token) {
    await db.session.updateMany({ where: { id: token.sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  (await cookies()).delete(COOKIE);
}

/** Revoca todas las sesiones de un usuario (cambio de contraseña, baja de la cuenta). */
export async function revokeAllSessions(userId: string, client: Tx | typeof db = db) {
  await client.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

const USER_FIELDS = {
  id: true,
  name: true,
  email: true,
  city: true,
  skills: true,
  bio: true,
  strikes: true,
  suspendedUntil: true,
  credits: true,
  plan: true,
  planRenewsAt: true,
  planAutoRenew: true,
  nextPlan: true,
  offerTemplate: true,
  role: true,
  deletedAt: true,
} as const;

// Memoizado por request: varios componentes pueden pedir el usuario sin repetir queries.
export const getCurrentUser = cache(async () => {
  const token = await readToken();
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: token.sessionId },
    select: { userId: true, revokedAt: true, expiresAt: true, user: { select: USER_FIELDS } },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || session.userId !== token.userId) return null;
  const { deletedAt, ...user } = session.user;
  return deletedAt ? null : user;
});

/** Usuario autenticado que ejecuta una operación. Los servicios reciben esto, nunca la cookie. */
export type Actor = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export function isAdmin(user: { role: string } | null | undefined) {
  return user?.role === "ADMIN";
}

export async function requireUser(next?: string) {
  const user = await getCurrentUser();
  if (!user) redirect(next ? `/ingresar?next=${encodeURIComponent(next)}` : "/ingresar");
  return user;
}

/** Para páginas de usuarios normales: el admin es enviado a su panel. */
export async function requireMember(next?: string) {
  const user = await requireUser(next);
  if (isAdmin(user)) redirect("/admin");
  return user;
}

/** Para páginas y acciones de administración. */
export async function requireAdmin(next = "/admin") {
  const user = await requireUser(next);
  if (!isAdmin(user)) redirect("/");
  return user;
}
