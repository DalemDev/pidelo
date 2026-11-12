import { describe, expect, it } from "vitest";
import { splitFee, toCents } from "@/domain/money";

describe("dinero", () => {
  it("convierte dólares a centavos enteros sin errores de punto flotante", () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(19.99)).toBe(1999);
  });

  it("la comisión y el pago al proveedor suman exactamente el total", () => {
    for (const [cents, rate] of [
      [1000, 0.1],
      [999, 0.07],
      [12345, 0.05],
      [1, 0.1],
    ] as const) {
      const { fee, provider } = splitFee(cents, rate);
      expect(fee + provider).toBe(cents);
      expect(Number.isInteger(fee)).toBe(true);
    }
  });
});
