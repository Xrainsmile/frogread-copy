// Lightweight namespaced logger. Any logged object that looks like it holds a
// secret (apiKey / token / secret / password fields) is auto-masked so keys
// can never leak into the console by accident.

const PREFIX = '[ReadFlow]';
const SENSITIVE = /apikey|secret|token|password/i;

function maskStr(s: string): string {
  if (s.length <= 8) return '****';
  return s.slice(0, 4) + '****' + s.slice(-4);
}

function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value !== 'object' || value === null) return value;
  if (seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => redact(v, seen));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'string' && SENSITIVE.test(k)) out[k] = maskStr(v);
    else if (typeof v === 'object' && v !== null) out[k] = redact(v, seen);
    else out[k] = v;
  }
  return out;
}

export const logger = {
  log: (...args: unknown[]) => console.log(PREFIX, ...args.map((a) => redact(a))),
  info: (...args: unknown[]) => console.info(PREFIX, ...args.map((a) => redact(a))),
  warn: (...args: unknown[]) => console.warn(PREFIX, ...args.map((a) => redact(a))),
  error: (...args: unknown[]) => console.error(PREFIX, ...args.map((a) => redact(a))),
  debug: (...args: unknown[]) => console.debug(PREFIX, ...args.map((a) => redact(a))),
};
