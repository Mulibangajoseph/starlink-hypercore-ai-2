// Per-device daily request quota. Counters live in memory inside the Worker
// isolate, so they reset when the isolate restarts: a soft limit, not billing.

interface Entry {
  day: string;
  used: number;
}

const counters = new Map<string, Entry>();
const MAX_ENTRIES = 5000;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalize(deviceId: string): string {
  const clean = (deviceId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return clean || 'anonymous';
}

function safeLimit(limit: number): number {
  return Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 100;
}

function read(id: string): Entry {
  const day = today();
  const existing = counters.get(id);
  if (existing && existing.day === day) return existing;
  const fresh: Entry = { day, used: 0 };
  counters.set(id, fresh);
  if (counters.size > MAX_ENTRIES) prune(day);
  return fresh;
}

function prune(day: string): void {
  for (const [key, entry] of counters) {
    if (entry.day !== day) counters.delete(key);
  }
  if (counters.size > MAX_ENTRIES) {
    const excess = counters.size - MAX_ENTRIES;
    let removed = 0;
    for (const key of counters.keys()) {
      counters.delete(key);
      removed += 1;
      if (removed >= excess) break;
    }
  }
}

/** Counts one request for the device. ok is false once the daily limit is used up. */
export function checkUsage(deviceId: string, limit: number): { ok: boolean; used: number; limit: number } {
  const max = safeLimit(limit);
  const entry = read(normalize(deviceId));
  if (entry.used >= max) return { ok: false, used: entry.used, limit: max };
  entry.used += 1;
  return { ok: true, used: entry.used, limit: max };
}

/** Reads today's usage without counting a request. */
export function getUsage(deviceId: string, limit: number): { used: number; limit: number } {
  const max = safeLimit(limit);
  const entry = read(normalize(deviceId));
  return { used: entry.used, limit: max };
}
