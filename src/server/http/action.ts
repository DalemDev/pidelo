import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { ZodType } from "zod";
import { AppError, ValidationError } from "@/domain/errors";
import { logger } from "@/server/infra/logger";

// Adaptador común de las server actions: las acciones solo leen el formulario, llaman a un servicio
// y traducen el resultado. Aquí se centraliza el manejo de errores para que ninguna filtre detalles internos.

export type FormState = { error?: string; ok?: string; warn?: string } | undefined;

const GENERIC_ERROR = "No pudimos completar la operación. Intenta de nuevo en unos minutos.";

/**
 * Ejecuta la lógica de una acción. Los errores de negocio (AppError) se muestran tal cual; cualquier
 * otro se registra y se responde con un mensaje genérico. redirect()/notFound() se dejan pasar.
 */
export async function runAction(name: string, fn: () => Promise<FormState | void>): Promise<FormState> {
  try {
    return (await fn()) ?? undefined;
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AppError) return { error: error.message };
    logger.error("action_failed", { action: name, error });
    return { error: GENERIC_ERROR };
  }
}

/**
 * Para acciones de un solo botón (sin estado de formulario): si el estado cambió entre que se mostró la
 * página y el clic, no hay nada que hacer; la página se vuelve a renderizar con el estado real.
 */
export async function runVoidAction(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AppError) {
      logger.info("action_rejected", { action: name, code: error.code, message: error.message });
      return;
    }
    logger.error("action_failed", { action: name, error });
  }
}

/** Valida datos de entrada con un esquema y lanza ValidationError con el primer mensaje. */
export function parseInput<T>(schema: ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Datos inválidos");
  return parsed.data;
}
