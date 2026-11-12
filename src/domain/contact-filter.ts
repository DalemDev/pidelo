// Filtro determinista de datos de contacto y de intentos de pagar por fuera.
// Módulo puro (sin dependencias de servidor) para poder probarlo aislado.

export const MASK = "[dato oculto]";

// Dominios que se pueden mencionar libremente (trámites públicos, universidades).
const ALLOWED_DOMAINS = /\.(?:gob|edu)\.ec\b/i;

const NUMBER_WORD = "(?:cero|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|\\d)";

const PATTERNS: { reason: string; re: RegExp }[] = [
  {
    reason: "correo",
    re: /[a-z0-9._%+-]+\s*(?:@|\(at\)|\[at\]|\sarroba\s)\s*[a-z0-9-]+(?:\s*(?:\.|\spunto\s|\sdot\s)\s*[a-z0-9-]+)*\s*(?:\.|\spunto\s|\sdot\s)\s*[a-z]{2,}/gi,
  },
  {
    reason: "enlace",
    re: /\b(?:https?:\/\/|www\.)\S+|\b(?:wa\.me|t\.me|bit\.ly|linktr\.ee)\/?\S*|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|ec|net|org|me|io|ly|co|app|link|site|store)\b(?:\/\S*)?/gi,
  },
  // 7 o más dígitos con separadores cortos: celulares (09…), fijos, +593, cédulas, cuentas.
  { reason: "teléfono o cuenta", re: /(?<![\w$])\+?\d(?:[\s.\-()]{0,2}\d){6,}(?!\d)/g },
  // Números dictados en palabras: "cero nueve nueve ocho…"
  { reason: "número en palabras", re: new RegExp(`(?:\\b${NUMBER_WORD}\\b[\\s,.\\-]*){6,}`, "gi") },
  { reason: "usuario de red social", re: /(?<![\w.])@[a-z0-9_.]{3,}/gi },
];

// Frases de alta precisión: la intención de salir de la plataforma es explícita.
const EVASION_PHRASES =
  /\b(?:por fuera|por afuera|fuera de (?:la )?(?:app|aplicaci[oó]n|plataforma|p[ií]delo)|sin (?:la |pagar )?comisi[oó]n|(?:p[aá]game|te pago|pagarte|me pagas|pago) (?:directo|directamente|por transferencia|en efectivo|por deuna|a mi cuenta)|(?:te paso|p[aá]same|dame|env[ií]ame|m[aá]ndame|te dejo|agr[eé]game (?:al|a mi)) (?:mi |tu )?(?:n[uú]mero|cel(?:ular)?|whats(?:app)?|wsp|wasap|contacto|correo|mail|cuenta|ig|insta(?:gram)?|telegram|face(?:book)?))/i;

// Señales débiles: por sí solas no bastan, pero ameritan revisión con IA.
const SOFT_SIGNALS =
  /whats|wsp|wasap|telegram|instagram|\big\b|\binsta\b|facebook|\bfb\b|tiktok|n[uú]mero|celular|\bcel\b|ll[aá]ma|escr[ií]be|contact|correo|\bmail\b|transfer|dep[oó]sito|efectivo|deuna|pichincha|produbanco|banco|directo|mi perfil|b[uú]scame|agr[eé]game|arroba/i;

export type FilterResult = {
  text: string;
  masked: boolean;
  blocked: boolean;
  reasons: string[];
  // Hay señales débiles y conviene una segunda opinión (IA).
  suspicious: boolean;
};

function isDate(s: string) {
  return /^\s*\d{4}-\d{1,2}-\d{1,2}\s*$|^\s*\d{1,2}-\d{1,2}-\d{4}\s*$/.test(s);
}

export function filterContact(input: string): FilterResult {
  const reasons = new Set<string>();
  let text = input;

  for (const { reason, re } of PATTERNS) {
    text = text.replace(re, (match) => {
      if (reason === "enlace" && ALLOWED_DOMAINS.test(match)) return match;
      if (reason === "teléfono o cuenta" && isDate(match)) return match;
      reasons.add(reason);
      // Conserva el espacio final para no pegar palabras.
      return /\s$/.test(match) ? `${MASK} ` : MASK;
    });
  }

  const blocked = EVASION_PHRASES.test(input);
  if (blocked) reasons.add("propone salir de la plataforma");

  // Dígitos "sueltos": sin contar fechas, horas ni montos, que son normales en una negociación.
  const loose = input
    .replace(/\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/g, "")
    .replace(/\d{1,2}:\d{2}/g, "")
    .replace(/\$\s?[\d.,]+|[\d.,]+\s?(?:usd|dólares|dolares)/gi, "");
  const digits = (loose.match(/\d/g) ?? []).length;
  const suspicious = !blocked && reasons.size === 0 && (SOFT_SIGNALS.test(input) || digits >= 5);

  return { text, masked: text !== input, blocked, reasons: [...reasons], suspicious };
}
