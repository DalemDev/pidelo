const usd = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" });

export function money(value: number) {
  return usd.format(value);
}

export function budgetLabel(min: number | null, max: number | null) {
  if (min == null && max == null) return "A convenir";
  if (min != null && max != null && min !== max) return `${money(min)} – ${money(max)}`;
  return money((max ?? min)!);
}

const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

export function timeAgo(date: Date) {
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(seconds, "second");
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(seconds / 86400), "day");
  return date.toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric" });
}

export function shortDate(date: Date) {
  return date.toLocaleDateString("es-EC", { weekday: "short", day: "numeric", month: "short" });
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function splitSkills(skills: string) {
  return skills.split(",").map((s) => s.trim()).filter(Boolean);
}
