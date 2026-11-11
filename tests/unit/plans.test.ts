import { describe, expect, it } from "vitest";
import { PLANS, PLAN_CYCLE_MS, quotePlanChange } from "@/domain/plans";

const now = new Date("2026-11-01T12:00:00Z");

describe("cotización de cambios de plan", () => {
  it("sin plan vigente cobra el mes completo", () => {
    const q = quotePlanChange({ plan: "FREE", planRenewsAt: null }, "PRO", now);
    expect(q).toMatchObject({ kind: "NEW", chargeCents: Math.round(PLANS.PRO.price * 100), credits: PLANS.PRO.monthlyCredits });
  });

  it("subir a mitad de ciclo cobra solo la diferencia proporcional", () => {
    const renewsAt = new Date(now.getTime() + PLAN_CYCLE_MS / 2);
    const q = quotePlanChange({ plan: "PRO", planRenewsAt: renewsAt }, "ELITE", now);
    expect(q.kind).toBe("UPGRADE");
    if (q.kind === "UPGRADE") {
      expect(q.chargeCents).toBe(Math.round((PLANS.ELITE.price - PLANS.PRO.price) * 100 * 0.5));
      expect(q.renewsAt).toEqual(renewsAt);
    }
  });

  it("bajar de plan no cobra y se programa para la renovación", () => {
    const renewsAt = new Date(now.getTime() + PLAN_CYCLE_MS / 3);
    expect(quotePlanChange({ plan: "ELITE", planRenewsAt: renewsAt }, "PRO", now)).toEqual({ kind: "DOWNGRADE", renewsAt });
  });

  it("el mismo plan vigente no genera cambio", () => {
    const renewsAt = new Date(now.getTime() + PLAN_CYCLE_MS / 3);
    expect(quotePlanChange({ plan: "PRO", planRenewsAt: renewsAt }, "PRO", now)).toEqual({ kind: "SAME" });
  });
});
