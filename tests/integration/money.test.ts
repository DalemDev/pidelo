import { beforeEach, expect, it } from "vitest";
import { ConflictError } from "@/domain/errors";
import { ACCOUNTS, splitFee } from "@/domain/money";
import { db } from "@/server/db/client";
import { encrypt } from "@/server/infra/crypto";
import { tryChargeBalance } from "@/server/services/credits";
import * as escrow from "@/server/services/escrow";
import { balance, post } from "@/server/services/ledger";
import * as payments from "@/server/services/payments";
import * as payouts from "@/server/services/payouts";
import { describeDb, makeRequestWithOffer, makeUser } from "./helpers";

// Carreras de condición con dinero (auditoría de seguridad): cada operación debe aplicarse una sola vez.

async function fund(userId: string, cents: number) {
  await db.$transaction((tx) =>
    post(tx, [{ account: ACCOUNTS.WORLD, amountCents: -cents }, { account: ACCOUNTS.available(userId), amountCents: cents }], "fondeo de prueba"),
  );
}

async function ledgerTotal() {
  const r = await db.ledgerEntry.aggregate({ _sum: { amountCents: true } });
  return r._sum.amountCents ?? 0;
}

describeDb("dinero (integración)", () => {
  let admin: Awaited<ReturnType<typeof makeUser>>;
  beforeEach(async () => {
    admin = await makeUser({ role: "ADMIN", name: "Admin" });
  });

  it("cobros simultáneos con saldo no sobregiran la billetera", async () => {
    const user = await makeUser();
    await fund(user.id, 1000);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => db.$transaction((tx) => tryChargeBalance(tx, user.id, 600, "compra"), { timeout: 20_000 })),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await balance(ACCOUNTS.available(user.id))).toBe(400);
  });

  it("confirmar el mismo pago varias veces a la vez lo registra una sola vez", async () => {
    const client = await makeUser();
    const provider = await makeUser();
    const { offer } = await makeRequestWithOffer(client, provider, { price: 50 });
    const payment = await payments.selectOffer(client, offer.id);

    const results = await Promise.allSettled([1, 2, 3].map(() => escrow.confirmPayment(admin, payment.id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await balance(ACCOUNTS.escrow(payment.requestId))).toBe(5000);
  });

  it("un pago confirmado no se puede rechazar después", async () => {
    const client = await makeUser();
    const provider = await makeUser();
    const { offer } = await makeRequestWithOffer(client, provider);
    const payment = await payments.selectOffer(client, offer.id);
    await db.payment.update({ where: { id: payment.id }, data: { status: "SUBMITTED" } });
    await escrow.confirmPayment(admin, payment.id);
    await expect(escrow.rejectPayment(admin, payment.id, "comprobante ilegible")).rejects.toBeInstanceOf(ConflictError);
  });

  it("flujo completo: pagar, entregar, confirmar; el libro siempre cuadra", async () => {
    const client = await makeUser();
    const provider = await makeUser();
    const { request, offer } = await makeRequestWithOffer(client, provider, { price: 100 });

    const payment = await payments.selectOffer(client, offer.id);
    await escrow.confirmPayment(admin, payment.id);
    const { markDelivered } = await import("@/server/services/requests");
    await markDelivered(provider, request.id);
    await escrow.confirmCompletion(client, request.id);

    const { provider: net, fee } = splitFee(10_000, 0.1);
    expect(await balance(ACCOUNTS.available(provider.id))).toBe(net);
    expect(await balance(ACCOUNTS.escrow(request.id))).toBe(0);
    expect(fee).toBe(1000);
    expect(await ledgerTotal()).toBe(0);
    // Confirmar otra vez no paga dos veces.
    await expect(escrow.confirmCompletion(client, request.id)).rejects.toBeInstanceOf(ConflictError);
    expect(await balance(ACCOUNTS.available(provider.id))).toBe(net);
  });

  it("una disputa con reparto devuelve y paga en las proporciones indicadas, una sola vez", async () => {
    const client = await makeUser();
    const provider = await makeUser();
    const { request, offer } = await makeRequestWithOffer(client, provider, { price: 80 });
    const payment = await payments.selectOffer(client, offer.id);
    await escrow.confirmPayment(admin, payment.id);
    await escrow.openDispute(client, request.id, "El trabajo llegó incompleto y no respondió a mis mensajes.");
    const dispute = await db.dispute.findFirstOrThrow({ where: { requestId: request.id } });

    const results = await Promise.allSettled([1, 2].map(() => escrow.resolveDispute(admin, dispute.id, "SPLIT", 3000, "Entrega parcial")));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await balance(ACCOUNTS.available(client.id))).toBe(3000);
    expect(await balance(ACCOUNTS.available(provider.id))).toBe(splitFee(5000, 0.1).provider);
    expect(await balance(ACCOUNTS.escrow(request.id))).toBe(0);
    expect(await db.auditLog.count({ where: { action: "dispute.resolve", entityId: dispute.id } })).toBe(1);
  });

  it("dos retiros simultáneos no superan el saldo", async () => {
    const user = await makeUser();
    await fund(user.id, 10_000);
    await db.user.update({
      where: { id: user.id },
      data: { bankName: "Banco", bankAccountType: "AHORROS", bankAccountNumber: encrypt("2200123456"), bankHolderName: user.name, bankHolderId: encrypt("1712345678") },
    });
    const results = await Promise.allSettled([1, 2].map(() => payouts.requestPayout(user, 6000)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await balance(ACCOUNTS.available(user.id))).toBe(4000);
    expect(await balance(ACCOUNTS.payoutPending(user.id))).toBe(6000);
  });

  it("después de cambiar la cuenta bancaria no se puede retirar por 48 h", async () => {
    const user = await makeUser();
    await fund(user.id, 5000);
    await db.user.update({
      where: { id: user.id },
      data: { bankAccountNumber: encrypt("2200123456"), bankHolderId: encrypt("1712345678"), bankUpdatedAt: new Date() },
    });
    await expect(payouts.requestPayout(user, 2000)).rejects.toBeInstanceOf(ConflictError);
  });
});
