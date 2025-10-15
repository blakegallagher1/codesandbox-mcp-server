import { UserTier } from '../types/index.js';
import { MCPError, ERROR_CODES } from '../middleware/error-handler.js';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

interface RateLimitEntry {
  count: number;
  resetAt: number;
  hourlyCount?: number;
  hourlyResetAt?: number;
  dailyExecutionMs?: number;
  dailyResetAt?: number;
}

interface QuotaLimits {
  sandboxesPerHour: number;
  apiCallsPerMinute: number;
  executionTimePerDay: number; // in milliseconds
}

const QUOTA_TIERS: Record<UserTier, QuotaLimits> = {
  free: {
    sandboxesPerHour: 5,
    apiCallsPerMinute: 10,
    executionTimePerDay: 3600000 // 1 hour in ms
  },
  pro: {
    sandboxesPerHour: 100,
    apiCallsPerMinute: 100,
    executionTimePerDay: 86400000 // 24 hours in ms
  }
};

export class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();

  constructor(_rateLimitPerMinute: number) {
    // Rate limit per minute is defined in QUOTA_TIERS
  }

  /**
   * Check if user has exceeded rate limit
   * @param userId - User identifier
   * @param tier - User tier (free or pro)
   * @param operation - Operation type (api_call or create_sandbox)
   * @returns boolean - true if within limits, throws error if exceeded
   */
  checkLimit(userId: string, tier: UserTier = 'free', operation: 'api_call' | 'create_sandbox' = 'api_call'): boolean {
    const key = `${userId}:${operation}`;
    const now = Date.now();
    const limits = QUOTA_TIERS[tier];

    let entry = this.limits.get(key);

    // Initialize or reset expired entries
    if (!entry || now > entry.resetAt) {
      entry = {
        count: 0,
        resetAt: now + 60000, // 1 minute
        hourlyCount: 0,
        hourlyResetAt: now + 3600000, // 1 hour
        dailyExecutionMs: 0,
        dailyResetAt: now + 86400000 // 24 hours
      };
      this.limits.set(key, entry);
    }

    // Reset hourly counter if expired
    if (entry.hourlyResetAt && now > entry.hourlyResetAt) {
      entry.hourlyCount = 0;
      entry.hourlyResetAt = now + 3600000;
    }

    // Reset daily counter if expired
    if (entry.dailyResetAt && now > entry.dailyResetAt) {
      entry.dailyExecutionMs = 0;
      entry.dailyResetAt = now + 86400000;
    }

    // Check API calls per minute
    if (operation === 'api_call') {
      if (entry.count >= limits.apiCallsPerMinute) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        logger.warn({
          userId,
          tier,
          operation,
          message: 'Rate limit exceeded',
          retryAfter
        });
        throw new MCPError(
          ERROR_CODES.RATE_LIMIT_EXCEEDED,
          `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
          429,
          true
        );
      }
      entry.count++;
    }

    // Check sandboxes per hour
    if (operation === 'create_sandbox') {
      if ((entry.hourlyCount || 0) >= limits.sandboxesPerHour) {
        const retryAfter = Math.ceil((entry.hourlyResetAt! - now) / 1000);
        logger.warn({
          userId,
          tier,
          operation,
          message: 'Sandbox quota exceeded',
          retryAfter
        });
        throw new MCPError(
          ERROR_CODES.QUOTA_EXCEEDED,
          `Sandbox quota exceeded. Try again in ${retryAfter} seconds.`,
          429,
          true
        );
      }
      entry.count++;
      entry.hourlyCount = (entry.hourlyCount || 0) + 1;
    }

    return true;
  }

  /**
   * Record execution time for daily quota tracking
   * @param userId - User identifier
   * @param tier - User tier
   * @param executionTimeMs - Execution time in milliseconds
   */
  recordExecutionTime(userId: string, tier: UserTier, executionTimeMs: number): void {
    const key = `${userId}:execution_time`;
    const now = Date.now();
    const limits = QUOTA_TIERS[tier];

    let entry = this.limits.get(key);

    if (!entry || now > (entry.dailyResetAt || 0)) {
      entry = {
        count: 0,
        resetAt: now + 60000,
        dailyExecutionMs: 0,
        dailyResetAt: now + 86400000
      };
      this.limits.set(key, entry);
    }

    entry.dailyExecutionMs = (entry.dailyExecutionMs || 0) + executionTimeMs;

    if (entry.dailyExecutionMs > limits.executionTimePerDay) {
      throw new MCPError(
        ERROR_CODES.QUOTA_EXCEEDED,
        'Daily execution time quota exceeded',
        429,
        true
      );
    }
  }

  /**
   * Get current usage stats for a user
   * @param userId - User identifier
   * @param tier - User tier
   * @returns Usage statistics
   */
  getUsageStats(userId: string, tier: UserTier): {
    apiCalls: { current: number; limit: number };
    sandboxes: { current: number; limit: number };
    executionTime: { current: number; limit: number };
  } {
    const limits = QUOTA_TIERS[tier];
    const apiCallEntry = this.limits.get(`${userId}:api_call`);
    const sandboxEntry = this.limits.get(`${userId}:create_sandbox`);
    const executionEntry = this.limits.get(`${userId}:execution_time`);

    return {
      apiCalls: {
        current: apiCallEntry?.count || 0,
        limit: limits.apiCallsPerMinute
      },
      sandboxes: {
        current: sandboxEntry?.hourlyCount || 0,
        limit: limits.sandboxesPerHour
      },
      executionTime: {
        current: executionEntry?.dailyExecutionMs || 0,
        limit: limits.executionTimePerDay
      }
    };
  }
}
