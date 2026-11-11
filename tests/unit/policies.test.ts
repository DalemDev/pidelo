import { describe, expect, it } from "vitest";
import { PAYMENT_DEADLINE_HOURS, contactUnlocked, isSuspended, offerCost, paymentDeadline } from "@/domain/policies";

describe("políticas de negocio", () => {
  it("ofertar cuesta más en solicitudes de mayor presupuesto", () => {
    expect(offerCost(null, null)).toBe(1);
    expect(offerCost(10, 19)).toBe(1);
    expect(offerCost(20, 99)).toBe(2);
    expect(offerCost(null, 500)).toBe(3);
  });

  it("el plazo de pago cuenta desde el último comprobante enviado", () => {
    const createdAt = new Date("2026-11-01T00:00:00Z");
    const submittedAt = new Date("2026-11-02T00:00:00Z");
    const hours = PAYMENT_DEADLINE_HOURS * 3600_000;
    expect(paymentDeadline({ createdAt, submittedAt: null }).getTime()).toBe(createdAt.getTime() + hours);
    expect(paymentDeadline({ createdAt, submittedAt }).getTime()).toBe(submittedAt.getTime() + hours);
  });

  it("el contacto solo se desbloquea en la oferta aceptada con el pago protegido", () => {
    expect(contactUnlocked({ acceptedOfferId: "o1", escrow: "HELD" }, "o1")).toBe(true);
    expect(contactUnlocked({ acceptedOfferId: "o1", escrow: "PENDING" }, "o1")).toBe(false);
    expect(contactUnlocked({ acceptedOfferId: "o1", escrow: "HELD" }, "o2")).toBe(false);
  });

  it("la suspensión vence en su fecha", () => {
    const now = new Date("2026-11-10T00:00:00Z");
    expect(isSuspended({ suspendedUntil: new Date("2026-11-11T00:00:00Z") }, now)).toBe(true);
    expect(isSuspended({ suspendedUntil: new Date("2026-11-09T00:00:00Z") }, now)).toBe(false);
    expect(isSuspended({ suspendedUntil: null }, now)).toBe(false);
  });
});
