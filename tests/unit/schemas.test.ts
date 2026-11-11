import { describe, expect, it } from "vitest";
import { AmountCentsSchema, PasswordSchema, RegisterSchema, RequestSchema } from "@/domain/schemas";

const baseRequest = {
  title: "Necesito una tutoría de cálculo",
  description: "Tengo examen el viernes y necesito repasar integrales.",
  category: "academico",
  kind: "ACOMPANAMIENTO",
  modality: "REMOTO",
  city: "Quito",
  urgent: false,
  featured: false,
  budgetMin: "15",
  budgetMax: "30",
  deadline: "",
};

describe("validación de entrada", () => {
  it("rechaza contraseñas cortas, comunes o repetitivas", () => {
    expect(PasswordSchema.safeParse("corta").success).toBe(false);
    expect(PasswordSchema.safeParse("12345678").success).toBe(false);
    expect(PasswordSchema.safeParse("aaaaaaaaaa").success).toBe(false);
    expect(PasswordSchema.safeParse("caballo-bateria-grapa").success).toBe(true);
  });

  it("el registro exige aceptar términos y ser mayor de edad", () => {
    const base = { name: "Ana", email: "ana@test.ec", password: "caballo-bateria-grapa", city: "Quito", skills: [] };
    expect(RegisterSchema.safeParse({ ...base, acceptTerms: true, adult: true }).success).toBe(true);
    expect(RegisterSchema.safeParse({ ...base, acceptTerms: false, adult: true }).success).toBe(false);
    expect(RegisterSchema.safeParse({ ...base, acceptTerms: true, adult: false }).success).toBe(false);
  });

  it("valida presupuestos y rechaza valores no numéricos", () => {
    expect(RequestSchema.safeParse(baseRequest).success).toBe(true);
    expect(RequestSchema.safeParse({ ...baseRequest, budgetMin: "50", budgetMax: "10" }).success).toBe(false);
    expect(RequestSchema.safeParse({ ...baseRequest, budgetMin: "Infinity" }).success).toBe(false);
    expect(RequestSchema.safeParse({ ...baseRequest, category: "inventada" }).success).toBe(false);
  });

  it("convierte montos a centavos y rechaza NaN o negativos", () => {
    expect(AmountCentsSchema.parse("12.34")).toBe(1234);
    expect(AmountCentsSchema.safeParse("abc").success).toBe(false);
    expect(AmountCentsSchema.safeParse("-5").success).toBe(false);
  });
});
