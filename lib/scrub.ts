/** Removes anything that could identify a person or describe their health before an error leaves the server. */
const PATTERNS: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]"],
  [/\+?\d[\d\s-]{8,}\d/g, "[number]"],
  [/\b[A-Z]{2,5}-[\dA-Z-]{4,}\b/g, "[reference]"],
  [/\b(diagnos\w*|prescri\w*|surgery|cancer|diabet\w*|cardi\w*|tablet\w*|medicine\w*|hospital\w*|discharge\w*|policy\s*no\w*)\b/gi, "[health]"],
];

export function scrubText(s: string): string {
  let out = s;
  for (const [re, to] of PATTERNS) out = out.replace(re, to);
  // Non-Latin text in an error can only be user content.
  return out.replace(/[ऀ-ॿ઀-૿]+/g, "[text]").slice(0, 500);
}

interface MinimalEvent {
  message?: string;
  user?: unknown;
  request?: unknown;
  extra?: unknown;
  contexts?: Record<string, unknown>;
  breadcrumbs?: unknown;
  tags?: Record<string, unknown>;
  server_name?: string;
  exception?: { values?: { type?: string; value?: string; stacktrace?: { frames?: { vars?: unknown; context_line?: unknown; pre_context?: unknown; post_context?: unknown }[] } }[] };
}

/** Sentry beforeSend. Keeps the error type, a scrubbed message and the code location. Drops everything else. */
export function scrubEvent<T extends MinimalEvent>(e: T): T {
  delete e.user;
  delete e.request;
  delete e.extra;
  delete e.breadcrumbs;
  delete e.server_name;
  if (e.contexts) e.contexts = { runtime: e.contexts.runtime, os: e.contexts.os };
  if (e.message) e.message = scrubText(e.message);
  for (const v of e.exception?.values ?? []) {
    if (v.value) v.value = scrubText(v.value);
    for (const f of v.stacktrace?.frames ?? []) {
      delete f.vars;
      delete f.context_line;
      delete f.pre_context;
      delete f.post_context;
    }
  }
  return e;
}
