const MAX = Number(process.env.RATE_LIMIT_MAX ?? 15);
const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 10_000);

const timestamps = new Map<string, number[]>();

export const checkRateLimit = (userId: string): boolean => {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const hits = (timestamps.get(userId) ?? []).filter((t) => t > cutoff);

  if (hits.length >= MAX) {
    timestamps.set(userId, hits);
    return false;
  }

  hits.push(now);
  timestamps.set(userId, hits);
  return true;
};
