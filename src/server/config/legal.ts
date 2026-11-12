import "server-only";
import { env } from "./env";

// Identificación del proveedor del servicio. En producción todas son obligatorias (ver assertProductionEnv);
// en desarrollo se muestran marcadores para que sea evidente qué falta configurar.

const placeholder = (name: string) => `[configurar ${name}]`;

export const LEGAL = {
  companyName: env.LEGAL_COMPANY_NAME ?? placeholder("LEGAL_COMPANY_NAME"),
  ruc: env.LEGAL_RUC ?? placeholder("LEGAL_RUC"),
  address: env.LEGAL_ADDRESS ?? placeholder("LEGAL_ADDRESS"),
  supportEmail: env.SUPPORT_EMAIL ?? placeholder("SUPPORT_EMAIL"),
  privacyEmail: env.PRIVACY_EMAIL ?? placeholder("PRIVACY_EMAIL"),
  // Fecha de la versión vigente de términos y privacidad (coincide con TERMS_VERSION en domain/schemas.ts).
  updatedAt: "1 de noviembre de 2026",
};
