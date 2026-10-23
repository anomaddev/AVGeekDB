/**
 * Fixed-window per-key rate limiter (in-memory). Fine for a single Node process on Hostinger.
 * TODO: for multiple instances, back with Postgres (usage table / RPC) or Redis.
 */
export class RateLimiter {
  private windows = new Map<string, { start: number; count: number }>();
  constructor(public limit: number, public windowMs = 60_000, private now = () => Date.now()) {}
  check(id: string): { allowed: boolean; remaining: number; resetMs: number } {
    const t = this.now();
    let w = this.windows.get(id);
    if (!w || t - w.start >= this.windowMs) { w = { start: t, count: 0 }; this.windows.set(id, w); }
    w.count++;
    return { allowed: w.count <= this.limit, remaining: Math.max(0, this.limit - w.count), resetMs: w.start + this.windowMs - t };
  }
}
