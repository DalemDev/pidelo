import "server-only";
import { InsufficientBalance, InsufficientCredits } from "@/domain/errors";
import { ACCOUNTS } from "@/domain/money";
import type { Tx } from "@/server/db/client";
import { balance, lockAccount, post } from "./ledger";

// Créditos (moneda interna para ofertar e impulsar solicitudes) y cobros con el saldo de la billetera.

/** Descuenta créditos de forma atómica: nunca deja el saldo en negativo aunque haya requests simultáneos. */
export async function spendCredits(tx: Tx, userId: string, amount: number, reason: string, description: string) {
  const { count } = await tx.user.updateMany({
    where: { id: userId, credits: { gte: amount } },
    data: { credits: { decrement: amount } },
  });
  if (count === 0) {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { credits: true } });
    throw new InsufficientCredits(amount, user.credits);
  }
  await tx.creditTransaction.create({ data: { userId, amount: -amount, reason, description } });
}

export async function grantCredits(tx: Tx, userId: string, amount: number, reason: string, description: string) {
  if (amount <= 0) return;
  await tx.user.update({ where: { id: userId }, data: { credits: { increment: amount } } });
  await tx.creditTransaction.create({ data: { userId, amount, reason, description } });
}

/**
 * Cobra con el saldo de la billetera (dinero ganado o reembolsado): el dinero no sale de la plataforma.
 * Devuelve false si el saldo no alcanza. Bloquea la cuenta para que dos cobros simultáneos no sobregiren.
 */
export async function tryChargeBalance(tx: Tx, userId: string, cents: number, memo: string) {
  const account = ACCOUNTS.available(userId);
  await lockAccount(tx, account);
  if ((await balance(account, tx)) < cents) return false;
  await post(
    tx,
    [
      { account, amountCents: -cents },
      { account: ACCOUNTS.REVENUE, amountCents: cents },
    ],
    memo,
    "PURCHASE",
    userId,
  );
  return true;
}

export async function chargeBalance(tx: Tx, userId: string, cents: number, memo: string) {
  if (!(await tryChargeBalance(tx, userId, cents, memo))) throw new InsufficientBalance();
}
