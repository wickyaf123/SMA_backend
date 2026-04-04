import { redis } from '../../config/redis';
import { logger } from '../../utils/logger';

const CREDIT_KEY_PREFIX = 'shovels:credits';
const CREDIT_KEY_TTL = 172800; // 48h — covers the full day + buffer

export class ShovelsCreditLimitError extends Error {
  constructor(used: number, limit: number) {
    super(`Shovels daily credit limit reached: ${used}/${limit}`);
    this.name = 'ShovelsCreditLimitError';
  }
}

function todayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${CREDIT_KEY_PREFIX}:${yyyy}-${mm}-${dd}`;
}

/**
 * Increment the daily API-call counter by `n` (default 1).
 * Returns the new total for today.
 */
export async function recordCredits(n: number = 1): Promise<number> {
  try {
    const key = todayKey();
    const total = await redis.incrby(key, n);
    if (total === n) {
      await redis.expire(key, CREDIT_KEY_TTL);
    }
    return total;
  } catch {
    return -1;
  }
}

/**
 * Read how many credits have been used today without incrementing.
 */
export async function getCreditsUsedToday(): Promise<number> {
  try {
    const val = await redis.get(todayKey());
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

/**
 * Check whether making `n` more calls would exceed the daily limit.
 * Throws `ShovelsCreditLimitError` if it would.
 */
export async function assertCreditBudget(limit: number, n: number = 1): Promise<void> {
  if (limit <= 0) return; // 0 = unlimited
  const used = await getCreditsUsedToday();
  if (used + n > limit) {
    logger.warn(
      { used, limit, requested: n },
      'Shovels daily credit limit would be exceeded — blocking call'
    );
    throw new ShovelsCreditLimitError(used, limit);
  }
}
