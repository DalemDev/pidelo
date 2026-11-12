import "server-only";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { ConflictError, ValidationError } from "@/domain/errors";
import { ACCOUNTS } from "@/domain/money";
import { TERMS_VERSION, type ProfileInput, type RegisterInput } from "@/domain/schemas";
import { assertActive } from "@/server/auth/guards";
import { createSession, revokeAllSessions, type Actor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { LIMITS, clear, clientIp, consume } from "@/server/infra/rate-limit";
import { audit } from "./audit";
import { grantCredits } from "./credits";
import { balance } from "./ledger";
import { screenOrReject } from "./moderation";

// Cuentas: registro, ingreso, perfil y los derechos del titular de datos (LOPDP): acceso/portabilidad y eliminación.

// Costo de bcrypt: 12 rondas (~250 ms) equilibra seguridad y tiempo de respuesta.
export const BCRYPT_ROUNDS = 12;
// Hash válido de una contraseña aleatoria: se compara contra él cuando el correo no existe, para que el
// tiempo de respuesta no revele qué correos están registrados.
const DUMMY_HASH = bcrypt.hashSync(randomBytes(16).toString("hex"), BCRYPT_ROUNDS);

export async function register(input: RegisterInput) {
  await consume(LIMITS.register(await clientIp()), (m) => `Se crearon demasiadas cuentas desde tu conexión. Intenta en ${m} min.`);
  if (await db.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
    // Sin verificación por correo no hay forma de ocultar esto sin bloquear el registro; queda limitado por IP.
    throw new ConflictError("Ya existe una cuenta con ese correo. Si es tuya, ingresa o recupera tu contraseña.");
  }
  const user = await db.user.create({
    data: {
      name: input.name,
      email: input.email,
      city: input.city,
      skills: input.skills.join(","),
      passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
      termsVersion: TERMS_VERSION,
      termsAcceptedAt: new Date(),
    },
  });
  await createSession(user.id);
}

export async function login(email: string, password: string) {
  // El intento se registra antes de comparar: muchas peticiones simultáneas no esquivan el límite.
  const limits = LIMITS.login(email, await clientIp());
  await consume(limits, (m) => `Demasiados intentos. Espera ${m} min o recupera tu contraseña.`);

  const user = await db.user.findUnique({ where: { email }, select: { id: true, passwordHash: true, deletedAt: true } });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || user.deletedAt || !valid) throw new ValidationError("Correo o contraseña incorrectos");

  await clear("LOGIN", email);
  await createSession(user.id);
}

export async function updateProfile(actor: Actor, input: ProfileInput) {
  assertActive(actor);
  // La bio es pública: se filtra como cualquier otro texto visible.
  const { text: bio, warning } = input.bio ? await screenOrReject(actor.id, "PROFILE", input.bio) : { text: "", warning: undefined };
  await db.user.update({ where: { id: actor.id }, data: { ...input, bio, skills: input.skills.join(",") } });
  return { warning };
}

// ---------------------------------------------------------------------------
// Derechos del titular (LOPDP arts. 13-16): acceso y portabilidad, eliminación.

/** Todos los datos personales del usuario en formato estructurado (JSON). */
export async function exportPersonalData(actor: Actor) {
  const [user, requests, offers, messages, reviewsWritten, reviewsReceived, payments, payouts, credits, notifications, violations] =
    await Promise.all([
      db.user.findUniqueOrThrow({
        where: { id: actor.id },
        select: {
          id: true, name: true, email: true, city: true, bio: true, skills: true, plan: true, credits: true,
          strikes: true, suspendedUntil: true, bankName: true, bankAccountType: true, bankHolderName: true,
          termsVersion: true, termsAcceptedAt: true, createdAt: true,
        },
      }),
      db.request.findMany({ where: { authorId: actor.id }, select: { id: true, title: true, description: true, status: true, createdAt: true } }),
      db.offer.findMany({ where: { providerId: actor.id }, select: { id: true, requestId: true, price: true, message: true, status: true, createdAt: true } }),
      db.message.findMany({ where: { senderId: actor.id }, select: { offerId: true, body: true, createdAt: true } }),
      db.review.findMany({ where: { authorId: actor.id }, select: { requestId: true, rating: true, comment: true, createdAt: true } }),
      db.review.findMany({ where: { targetId: actor.id }, select: { requestId: true, rating: true, comment: true, createdAt: true } }),
      db.payment.findMany({ where: { payerId: actor.id }, select: { code: true, amountCents: true, method: true, status: true, createdAt: true } }),
      db.payout.findMany({ where: { userId: actor.id }, select: { amountCents: true, status: true, createdAt: true, processedAt: true } }),
      db.creditTransaction.findMany({ where: { userId: actor.id }, select: { amount: true, reason: true, description: true, createdAt: true } }),
      db.notification.findMany({ where: { userId: actor.id }, select: { title: true, body: true, createdAt: true } }),
      db.violation.findMany({ where: { userId: actor.id }, select: { context: true, action: true, reasons: true, createdAt: true } }),
    ]);
  await audit({ actorId: actor.id, action: "account.export", entity: "User", entityId: actor.id });
  return {
    exportedAt: new Date().toISOString(),
    // Número de cuenta y cédula se omiten de la exportación por seguridad; el usuario los ve en su billetera.
    user,
    requests,
    offers,
    messages,
    reviewsWritten,
    reviewsReceived,
    payments,
    payouts,
    creditTransactions: credits,
    notifications,
    moderationWarnings: violations,
  };
}

/**
 * Elimina la cuenta: anonimiza los datos personales y cierra todas las sesiones. Los registros contables
 * y de pagos se conservan sin datos identificables, porque la ley tributaria obliga a mantenerlos.
 * No se puede eliminar con trabajos en curso, dinero en la billetera o retiros pendientes.
 */
export async function deleteAccount(actor: Actor, currentPassword: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.id }, select: { passwordHash: true } });
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw new ValidationError("La contraseña no es correcta");

  const [activeJobs, available, pendingPayout] = await Promise.all([
    db.request.count({
      where: {
        status: { in: ["AWAITING_PAYMENT", "IN_PROGRESS", "DELIVERED"] },
        OR: [{ authorId: actor.id }, { acceptedOffer: { providerId: actor.id } }],
      },
    }),
    balance(ACCOUNTS.available(actor.id)),
    balance(ACCOUNTS.payoutPending(actor.id)),
  ]);
  if (activeJobs) throw new ConflictError("Tienes trabajos en curso. Termínalos o resuélvelos antes de eliminar tu cuenta.");
  if (available > 0 || pendingPayout > 0) throw new ConflictError("Tienes dinero en tu billetera o un retiro pendiente. Retíralo antes de eliminar tu cuenta.");

  await db.$transaction(async (tx) => {
    // Solicitudes abiertas: se cancelan y se devuelven los créditos a quienes ofertaron.
    const open = await tx.request.findMany({ where: { authorId: actor.id, status: "OPEN" }, select: { id: true, title: true } });
    for (const r of open) {
      const { count } = await tx.request.updateMany({ where: { id: r.id, status: "OPEN" }, data: { status: "CANCELLED" } });
      if (!count) continue;
      const pending = await tx.offer.findMany({ where: { requestId: r.id, status: "PENDING" } });
      await tx.offer.updateMany({ where: { requestId: r.id, status: "PENDING" }, data: { status: "REJECTED" } });
      for (const o of pending) await grantCredits(tx, o.providerId, o.creditsSpent, "REFUND", `Devolución: solicitud cancelada · ${r.title}`);
    }
    await tx.offer.updateMany({ where: { providerId: actor.id, status: "PENDING" }, data: { status: "WITHDRAWN" } });

    await tx.user.update({
      where: { id: actor.id },
      data: {
        name: "Usuario eliminado",
        email: `eliminado+${actor.id}@pidelo.invalid`,
        passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 4),
        bio: "",
        skills: "",
        offerTemplate: "",
        bankName: null,
        bankAccountType: null,
        bankAccountNumber: null,
        bankHolderName: null,
        bankHolderId: null,
        deletedAt: new Date(),
      },
    });
    await tx.passwordReset.deleteMany({ where: { userId: actor.id } });
    await revokeAllSessions(actor.id, tx);
    await audit({ actorId: actor.id, action: "account.delete", entity: "User", entityId: actor.id }, tx);
  });
}

