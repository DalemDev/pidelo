import { describe, expect, it } from "vitest";
import { MASK, filterContact } from "@/domain/contact-filter";

describe("filtro de contacto", () => {
  it.each([
    "mi número es 0991234567",
    "escríbeme a juan.perez@gmail.com",
    "juan arroba gmail punto com",
    "agrégame en wa.me/593991234567",
    "cero nueve nueve uno dos tres cuatro cinco seis siete",
  ])("oculta datos de contacto: %s", (input) => {
    const r = filterContact(input);
    expect(r.masked).toBe(true);
    expect(r.text).toContain(MASK);
  });

  it("bloquea propuestas de pagar por fuera", () => {
    expect(filterContact("mejor págame directo y nos ahorramos la comisión").blocked).toBe(true);
    expect(filterContact("te paso mi whatsapp").blocked).toBe(true);
  });

  it("no toca precios, fechas ni horas", () => {
    const r = filterContact("Lo entrego el 2026-11-20 a las 15:30 por $45.50");
    expect(r.masked).toBe(false);
    expect(r.blocked).toBe(false);
  });

  it("permite dominios públicos .gob.ec y .edu.ec", () => {
    expect(filterContact("el formulario está en www.sri.gob.ec").masked).toBe(false);
  });
});
