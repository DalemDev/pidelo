import { z } from "zod";
import { CATEGORY_SLUGS, CITIES, KIND_VALUES, MODALITY_VALUES } from "./catalog";

// Esquemas de entrada de la aplicación. Toda entrada del usuario se valida aquí antes de llegar a un servicio.

// ---------------------------------------------------------------------------
// Contraseñas (OWASP ASVS 2.1: longitud mínima 8, máxima amplia, sin reglas de composición,
// rechazo de contraseñas comunes).

const COMMON_PASSWORDS = new Set([
  "12345678", "123456789", "1234567890", "password", "password1", "contraseña", "contrasena", "qwerty123",
  "qwertyuiop", "11111111", "00000000", "iloveyou", "abc12345", "12341234", "87654321", "123123123",
  "admin123", "welcome1", "ecuador1", "ecuador123", "quito123", "guayaquil", "pidelo123", "asdfghjk",
  "superman", "11223344", "a1b2c3d4", "passw0rd", "1q2w3e4r", "zaq12wsx",
]);

export const PasswordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .max(128, "La contraseña es demasiado larga (máximo 128 caracteres)")
  .refine((p) => !COMMON_PASSWORDS.has(p.toLowerCase()), "Esa contraseña es muy común. Elige otra.")
  .refine((p) => new Set(p).size >= 4, "La contraseña es demasiado repetitiva. Elige otra.");

const Email = z.string().trim().toLowerCase().max(254).email("Correo inválido");

// ---------------------------------------------------------------------------
// Cuenta

export const TERMS_VERSION = "2026-11";

export const RegisterSchema = z
  .object({
    name: z.string().trim().min(2, "Escribe tu nombre").max(60),
    email: Email,
    password: PasswordSchema,
    city: z.enum(CITIES),
    skills: z.array(z.enum(CATEGORY_SLUGS)),
    acceptTerms: z.literal(true, { error: "Debes aceptar los términos y la política de privacidad" }),
    adult: z.literal(true, { error: "Debes ser mayor de edad para crear una cuenta" }),
  })
  .refine((d) => !d.password.toLowerCase().includes(d.email.split("@")[0]!), {
    message: "La contraseña no puede contener tu correo",
  });
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({ email: Email, password: z.string().min(1).max(128) });

export const ProfileSchema = z.object({
  name: z.string().trim().min(2, "Escribe tu nombre").max(60),
  city: z.enum(CITIES),
  bio: z.string().trim().max(500),
  skills: z.array(z.enum(CATEGORY_SLUGS)),
});
export type ProfileInput = z.infer<typeof ProfileSchema>;

export const ResetPasswordSchema = z
  .object({ password: PasswordSchema, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { message: "Las contraseñas no coinciden" });

export const BankAccountSchema = z.object({
  bankName: z.string().trim().min(3, "Indica el banco").max(60),
  bankAccountType: z.enum(["AHORROS", "CORRIENTE"]),
  bankAccountNumber: z.string().trim().regex(/^\d{6,20}$/, "El número de cuenta debe tener solo dígitos"),
  bankHolderName: z.string().trim().min(3, "Indica el titular").max(80),
  bankHolderId: z.string().trim().regex(/^\d{10}(\d{3})?$/, "Cédula (10 dígitos) o RUC (13 dígitos)"),
  // Reautenticación: cambiar a dónde va el dinero exige la contraseña actual.
  currentPassword: z.string().min(1, "Ingresa tu contraseña actual").max(128),
});
export type BankAccountInput = z.infer<typeof BankAccountSchema>;

// ---------------------------------------------------------------------------
// Solicitudes, ofertas y reseñas

const optionalMoney = z.preprocess(
  (v) => (v === "" || v == null ? null : Number(v)),
  z.number().finite().min(0).max(100000).nullable(),
);

export const RequestSchema = z
  .object({
    title: z.string().trim().min(8, "El título es muy corto").max(100),
    description: z.string().trim().min(20, "Describe un poco más lo que necesitas").max(5000),
    category: z.enum(CATEGORY_SLUGS),
    kind: z.enum(KIND_VALUES),
    modality: z.enum(MODALITY_VALUES),
    city: z.enum(CITIES),
    urgent: z.boolean(),
    featured: z.boolean(),
    budgetMin: optionalMoney,
    budgetMax: optionalMoney,
    // Fecha local de Ecuador (UTC-5) al final del día.
    deadline: z.preprocess((v) => (v ? new Date(`${v}T23:59:00-05:00`) : null), z.date().nullable()),
  })
  .refine((d) => d.budgetMin == null || d.budgetMax == null || d.budgetMin <= d.budgetMax, {
    message: "El presupuesto mínimo no puede ser mayor que el máximo",
  })
  .refine((d) => !d.deadline || !Number.isNaN(d.deadline.getTime()), { message: "Fecha límite inválida" });
export type RequestInput = z.infer<typeof RequestSchema>;

export const OfferSchema = z.object({
  price: z.coerce.number().finite().min(1, "El precio mínimo es $1").max(100000),
  deliveryDays: z.coerce.number().int().min(0).max(365),
  message: z.string().trim().min(15, "Cuéntale por qué eres la persona indicada").max(2000),
});
export type OfferInput = z.infer<typeof OfferSchema>;

export const MessageSchema = z.string().trim().min(1).max(2000, "Mensaje muy largo");

export const ReviewSchema = z.object({
  rating: z.coerce.number().int().min(1, "Elige una calificación").max(5),
  comment: z.string().trim().max(1000),
});
export type ReviewInput = z.infer<typeof ReviewSchema>;

export const DisputeSchema = z.string().trim().min(20, "Cuéntanos qué pasó (al menos 20 caracteres)").max(2000);

/** Monto en dólares del formulario → centavos enteros (rechaza NaN, infinitos y más de 2 decimales de ruido). */
export const AmountCentsSchema = z.preprocess(
  (v) => Math.round(Number(v) * 100),
  z.number({ error: "Monto inválido" }).int().finite().min(0).max(10_000_000),
);
