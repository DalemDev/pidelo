import { expect, it } from "vitest";
import { RateLimitError } from "@/domain/errors";
import { db } from "@/server/db/client";
import { consume } from "@/server/infra/rate-limit";
import { expireUnpaidSelections } from "@/server/jobs/lifecycle";
import * as payments from "@/server/services/payments";
import { cancelRequest } from "@/server/services/requests";
import { describeDb, makeRequestWithOffer, makeUser } from "./helpers";

describeDb("solicitudes y límites (integración)", () => {
  it("cancelar muchas veces a la vez devuelve los créditos una sola vez", async () => {
    const client = await makeUser();
    const provider = await makeUser({ credits: 0 });
    const { request } = await makeRequestWithOffer(client, provider, { creditsSpent: 3 });

    await Promise.allSettled(Array.from({ length: 10 }, () => cancelRequest(client, request.id)));
    const after = await db.user.findUniqueOrThrow({ where: { id: provider.id }, select: { credits: true } });
    expect(after.credits).toBe(3);
    expect((await db.request.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("CANCELLED");
  });

  it("no se puede cancelar una solicitud con el comprobante ya enviado", async () => {
    const client = await makeUser();
    const provider = await makeUser();
    const { request, offer } = await makeRequestWithOffer(client, provider);
    const payment = await payments.selectOffer(client, offer.id);
    await db.payment.update({ where: { id: payment.id }, data: { status: "SUBMITTED" } });
    await expect(cancelRequest(client, request.id)).rejects.toThrow(/disputa/);
    await expect(payments.cancelPayment(client, payment.id)).rejects.toThrow();
  });

  it("si vence el plazo de pago, la solicitud se reabre y la oferta vuelve a competir", async () => {
    const client = await makeUser();
    const provider = await makeUser();
    const { request, offer } = await makeRequestWithOffer(client, provider);
    const payment = await payments.selectOffer(client, offer.id);
    await db.payment.update({ where: { id: payment.id }, data: { createdAt: new Date(Date.now() - 49 * 3600_000) } });

    await Promise.all([expireUnpaidSelections(), expireUnpaidSelections()]);
    const [req, off, pay] = await Promise.all([
      db.request.findUniqueOrThrow({ where: { id: request.id } }),
      db.offer.findUniqueOrThrow({ where: { id: offer.id } }),
      db.payment.findUniqueOrThrow({ where: { id: payment.id } }),
    ]);
    expect([req.status, off.status, pay.status]).toEqual(["OPEN", "PENDING", "CANCELLED"]);
    expect(await db.notification.count({ where: { userId: client.id, title: { contains: "plazo" } } })).toBe(1);
  });

  it("el límite de uso deja pasar exactamente el máximo en uso normal", async () => {
    const limits = [{ kind: "LOGIN" as const, key: `secuencial-${Date.now()}`, max: 5, windowMinutes: 15 }];
    for (let i = 0; i < 5; i++) await consume(limits, (m) => `espera ${m}`);
    await expect(consume(limits, (m) => `espera ${m}`)).rejects.toBeInstanceOf(RateLimitError);
  });

  it("con peticiones simultáneas nunca pasan más del máximo (falla en modo seguro)", async () => {
    const limits = [{ kind: "LOGIN" as const, key: `rafaga-${Date.now()}`, max: 5, windowMinutes: 15 }];
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => consume(limits, (m) => `espera ${m}`)));
    expect(results.filter((r) => r.status === "fulfilled").length).toBeLessThanOrEqual(5);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: expect.any(RateLimitError) });
  });
});
