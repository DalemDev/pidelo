// Errores de negocio. Su mensaje es seguro para mostrar al usuario; cualquier otro error es un fallo
// interno que se registra y se responde con un mensaje genérico (no se filtran detalles al cliente).

export type ErrorCode = "VALIDATION" | "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "RATE_LIMITED" | "PAYMENT";

export class AppError extends Error {
  constructor(
    message: string,
    readonly code: ErrorCode,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Datos de entrada inválidos. */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, "VALIDATION");
  }
}

/** El recurso no existe o el usuario no puede saber que existe. */
export class NotFoundError extends AppError {
  constructor(message = "No encontramos lo que buscas") {
    super(message, "NOT_FOUND");
  }
}

/** El usuario no tiene permiso para esta operación. */
export class ForbiddenError extends AppError {
  constructor(message = "No tienes permiso para hacer esto") {
    super(message, "FORBIDDEN");
  }
}

/** El estado cambió y la operación ya no aplica (p. ej. otra acción ganó la carrera). */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "CONFLICT");
  }
}

export class RateLimitError extends AppError {
  constructor(message: string) {
    super(message, "RATE_LIMITED");
  }
}

/** Problemas de saldo, créditos o medio de pago. */
export class PaymentError extends AppError {
  constructor(message: string) {
    super(message, "PAYMENT");
  }
}

export class InsufficientCredits extends PaymentError {
  constructor(
    readonly needed: number,
    readonly balance: number,
  ) {
    super(`Necesitas ${needed} crédito${needed === 1 ? "" : "s"} y tienes ${balance}.`);
  }
}

export class InsufficientBalance extends PaymentError {
  constructor() {
    super("Tu saldo no alcanza. Usa otro método de pago.");
  }
}
