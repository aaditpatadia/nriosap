/**
 * Structured logs. Only values that cannot carry names, numbers or health details are accepted:
 * numbers, booleans, and short identifier-like strings. Anything else is replaced.
 */
const SAFE = /^[\w.:-]{1,64}$/;

export function safeFields(fields: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (typeof v === "string" && SAFE.test(v) && !/\d{7,}/.test(v.replace(/-/g, "")) ) out[k] = v;
    else if (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)) out[k] = v;
    else out[k] = "[redacted]";
  }
  return out;
}

export function log(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ level, event, at: new Date().toISOString(), ...safeFields(fields) });
  if (level === "error") console.error(line);
  else console.log(line);
}
