import "server-only";
import bcrypt from "bcryptjs";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors";
import { ACCOUNTS, MIN_PAYOUT_CENTS, fmtCents } from "@/domain/money";
import type { BankAccountInput } from "@/domain/schemas";
import { assertAdmin, assertMember } from "@/server/auth/guards";
import type { Actor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { decrypt, encrypt } from "@/server/infra/crypto";
import { walletSummary } from "@/server/queries/wallet";
import { audit } from "./audit";
import { lockAccount, post } from "./ledger";
import { notify, notifyAdmins } from "./notifications";

// Retiros de la billetera a la cuenta bancaria del usuario. La transferencia la hace un admin y la marca como pagada.

export type BankDetails = {
  bankName: string;
  bankAccountType: string;
  bankAccountNumber: string;
  bankHolderName: string;
  bankHolderId: string;
};

/** Datos bancarios descifrados del usuario (para mostrar enmascarados o copiar al retiro). */
export async function getBankDetails(userId: string): Promise<BankDetails | null> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { bankName: true, bankAccountType: true, bankAccountNumber: true, bankHolderName: true, bankHolderId: true },
  });
  if (!u?.bankAccountNumber) return null;
  return {
    bankName: u.bankName ?? "",
    bankAccountType: u.bankAccountType ?? "",
    bankAccountNumber: decrypt(u.bankAccountNumber),
    bankHolderName: u.bankHolderName ?? "",
    bankHolderId: decrypt(u.bankHolderId) ?? "",
  };
}

/** Lee la copia de datos bancarios guardada en un retiro (cifrada; los retiros antiguos son JSON plano). */
export function readBankSnapshot(snapshot: string): BankDetails {
  return JSON.parse(decrypt(snapshot)) as BankDetails;
}

/**
 * Guarda la cuenta de retiro. Exige la contraseña actual (reautenticación), avisa al usuario y bloquea
 * los retiros durante unas horas: si alguien robó la sesión, no puede desviar el saldo de inmediato.
 */
export async function saveBankAccount(actor: Actor, input: BankAccountInput) {
  assertMember(actor);
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.id }, select: { passwordHash: true } });
  if (!(await bcrypt.compare(input.currentPassword, user.passwordHash))) throw new ValidationError("La contraseña actual no es correcta");

  const { currentPassword: _, ...bank } = input;
  void _;
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: actor.id },
      data: {
        bankName: bank.bankName,
        bankAccountType: bank.bankAccountType,
        bankAccountNumber: encrypt(bank.bankAccountNumber),
        bankHolderName: bank.bankHolderName,
        bankHolderId: encrypt(bank.bankHolderId),
        bankUpdatedAt: new Date(),
      },
    });
    await audit({ actorId: actor.id, action: "bank.update", entity: "User", entityId: actor.id, data: { bank: bank.bankName, tail: bank.bankAccountNumber.slice(-4) } }, tx);
  });
  await notify(
    actor.id,
    "Cambiaste tu cuenta de retiro",
    `Nueva cuenta terminada en ${bank.bankAccountNumber.slice(-4)}. Por seguridad, los retiros se habilitan en 48 h. Si no fuiste tú, cambia tu contraseña y escríbenos.`,
    "/billetera",
  );
}

export async function requestPayout(actor: Actor, cents: number) {
  assertMember(actor);
  if (!Number.isSafeInteger(cents) || cents < MIN_PAYOUT_CENTS) throw new ValidationError(`El retiro mínimo es ${fmtCents(MIN_PAYOUT_CENTS)}`);
  const bank = await getBankDetails(actor.id);
  if (!bank) throw new ValidationError("Primero registra tu cuenta bancaria");

  await db.$transaction(async (tx) => {
    // Con la cuenta bloqueada, un segundo retiro simultáneo espera y ve el saldo ya descontado.
    // walletSummary lee fuera de la transacción, pero ya incluye lo que confirmaron los retiros anteriores.
    await lockAccount(tx, ACCOUNTS.available(actor.id));
    const wallet = await walletSummary(actor.id);
    if (wallet.bankHoldUntil) throw new ConflictError("Cambiaste tu cuenta bancaria hace poco. Los retiros se habilitan 48 h después del cambio.");
    if (cents > wallet.withdrawable) throw new ValidationError(`Puedes retirar hasta ${fmtCents(wallet.withdrawable)}`);
    const payout = await tx.payout.create({ data: { userId: actor.id, amountCents: cents, bankSnapshot: encrypt(JSON.stringify(bank)) } });
    await post(
      tx,
      [
        { account: ACCOUNTS.available(actor.id), amountCents: -cents },
        { account: ACCOUNTS.payoutPending(actor.id), amountCents: cents },
      ],
      "Retiro solicitado",
      "PAYOUT",
      payout.id,
    );
    await audit({ actorId: actor.id, action: "payout.request", entity: "Payout", entityId: payout.id, data: { cents } }, tx);
  });
  await notifyAdmins("Retiro solicitado", `${actor.name} · ${fmtCents(cents)}`, "/admin");
}

export async function markPayoutPaid(actor: Actor, payoutId: string, reference: string) {
  assertAdmin(actor);
  if (reference.trim().length < 4) throw new ValidationError("Ingresa el número de la transferencia");
  const payout = await db.payout.findUnique({ where: { id: payoutId } });
  if (!payout) throw new NotFoundError("Retiro no encontrado");

  await db.$transaction(async (tx) => {
    // Condicionado al estado: evita pagar dos veces si dos admins hacen clic a la vez.
    const { count } = await tx.payout.updateMany({
      where: { id: payoutId, status: "REQUESTED" },
      data: { status: "PAID", reference: reference.slice(0, 100), processedAt: new Date(), processedById: actor.id },
    });
    if (!count) throw new ConflictError("Este retiro ya fue procesado");
    await post(
      tx,
      [
        { account: ACCOUNTS.payoutPending(payout.userId), amountCents: -payout.amountCents },
        { account: ACCOUNTS.WORLD, amountCents: payout.amountCents },
      ],
      `Transferencia de retiro ${reference}`,
      "PAYOUT",
      payout.id,
    );
    await audit({ actorId: actor.id, action: "payout.paid", entity: "Payout", entityId: payoutId, data: { cents: payout.amountCents, reference } }, tx);
  });
  await notify(payout.userId, "Te transferimos tu retiro", `${fmtCents(payout.amountCents)} · comprobante ${reference}`, "/billetera");
}

export async function rejectPayout(actor: Actor, payoutId: string, note: string) {
  assertAdmin(actor);
  if (note.trim().length < 5) throw new ValidationError("Explica el motivo (p. ej. la cuenta no está a nombre del titular)");
  const payout = await db.payout.findUnique({ where: { id: payoutId } });
  if (!payout) throw new NotFoundError("Retiro no encontrado");
  if (payout.userId === actor.id) throw new ForbiddenError();

  await db.$transaction(async (tx) => {
    const { count } = await tx.payout.updateMany({
      where: { id: payoutId, status: "REQUESTED" },
      data: { status: "REJECTED", adminNote: note.slice(0, 500), processedAt: new Date(), processedById: actor.id },
    });
    if (!count) throw new ConflictError("Este retiro ya fue procesado");
    // Asiento inverso: el dinero vuelve al saldo disponible.
    await post(
      tx,
      [
        { account: ACCOUNTS.payoutPending(payout.userId), amountCents: -payout.amountCents },
        { account: ACCOUNTS.available(payout.userId), amountCents: payout.amountCents },
      ],
      "Retiro rechazado: se devuelve al saldo",
      "PAYOUT",
      payout.id,
    );
    await audit({ actorId: actor.id, action: "payout.reject", entity: "Payout", entityId: payoutId, data: { note } }, tx);
  });
  await notify(payout.userId, "Retiro rechazado", `${note} · el dinero volvió a tu saldo`, "/billetera");
}
