import "server-only";

// Logger estructurado (una línea JSON por evento) para que la plataforma de logs pueda filtrar y alertar.
// Nunca registrar contraseñas, tokens, números de cuenta completos ni contenido de comprobantes.

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const SENSITIVE = /pass(word)?|token|secret|authorization|cookie|account(number)?|holderid|cedula/i;

function redact(fields: Fields): Fields {
  const out: Fields = {};
  for (const [k, v] of Object.entries(fields)) out[k] = SENSITIVE.test(k) ? "[redactado]" : v;
  return out;
}

function serializeError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return { message: String(error) };
}

function write(level: Level, event: string, fields: Fields = {}) {
  const { error, ...rest } = fields;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...redact(rest),
    ...(error !== undefined ? { error: serializeError(error) } : {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (event: string, fields?: Fields) => process.env.NODE_ENV !== "production" && write("debug", event, fields),
  info: (event: string, fields?: Fields) => write("info", event, fields),
  warn: (event: string, fields?: Fields) => write("warn", event, fields),
  error: (event: string, fields?: Fields) => write("error", event, fields),
};
