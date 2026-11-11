import { describe, expect, it } from "vitest";
import { decrypt, encrypt, maskTail, safeEqual } from "@/server/infra/crypto";

describe("cifrado de datos sensibles", () => {
  it("cifra y descifra; dos cifrados del mismo valor son distintos", () => {
    const a = encrypt("2200123456");
    const b = encrypt("2200123456");
    expect(a).not.toBe(b);
    expect(a.startsWith("enc:v1:")).toBe(true);
    expect(decrypt(a)).toBe("2200123456");
  });

  it("detecta manipulación del texto cifrado", () => {
    const c = encrypt("1712345678");
    const tampered = c.slice(0, -2) + (c.endsWith("A") ? "BB" : "AA");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("los valores antiguos sin cifrar se leen tal cual", () => {
    expect(decrypt("2200123456")).toBe("2200123456");
    expect(decrypt(null)).toBeNull();
  });

  it("enmascara y compara secretos", () => {
    expect(maskTail("2200123456")).toBe("•••• 3456");
    expect(safeEqual("Bearer abc", "Bearer abc")).toBe(true);
    expect(safeEqual("Bearer abc", "Bearer abd")).toBe(false);
  });
});
