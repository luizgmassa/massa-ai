/**
 * Rate Limiter
 * 
 * Token bucket algorithm for rate limiting API requests and token usage
 */

import { config } from '../config/index.js';
import { logger } from './logger.js';

/**
 * Rate limiter using token bucket algorithm
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per second

  constructor(maxTokens: number, refillRate: number) {
    this.maxTokens = maxTokens;
    this.refillRate = refillRate;
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * Refill tokens based on time elapsed
   */
  private refill(): void {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000; // seconds
    const tokensToAdd = timePassed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Try to consume tokens
   */
  tryConsume(tokens: number = 1): boolean {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    return false;
  }

  /**
   * Wait until tokens are available
   */
  async consume(tokens: number = 1): Promise<void> {
    while (!this.tryConsume(tokens)) {
      const waitTime = ((tokens - this.tokens) / this.refillRate) * 1000;
      await this.sleep(Math.max(100, waitTime));
    }
  }

  /**
   * Get current token count
   */
  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Reset rate limiter
   */
  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Multi-tier rate limiter for requests and LLM tokens
 */
export class SmartRateLimiter {
  private requestLimiter: RateLimiter;
  private tokenLimiter: RateLimiter;

  constructor() {
    const limits = config.get('rateLimit');
    
    // Requests per minute -> per second
    this.requestLimiter = new RateLimiter(
      limits.requestsPerMinute,
      limits.requestsPerMinute / 60
    );

    // Tokens per minute -> per second
    this.tokenLimiter = new RateLimiter(
      limits.tokensPerMinute,
      limits.tokensPerMinute / 60
    );

    logger.info('Smart Rate Limiter initialized', {
      requestsPerMinute: limits.requestsPerMinute,
      tokensPerMinute: limits.tokensPerMinute
    });
  }

  /**
   * Check if request can proceed
   */
  async checkRequest(estimatedTokens: number = 1000): Promise<boolean> {
    const hasRequestCapacity = this.requestLimiter.tryConsume(1);
    const hasTokenCapacity = this.tokenLimiter.tryConsume(estimatedTokens);

    if (!hasRequestCapacity) {
      logger.warn('Request rate limit exceeded', {
        availableTokens: this.requestLimiter.getAvailableTokens(),
      });
      return false;
    }

    if (!hasTokenCapacity) {
      logger.warn('Token rate limit exceeded', { estimatedTokens });
      return false;
    }

    return true;
  }

  /**
   * Wait until request can proceed
   */
  async waitForCapacity(estimatedTokens: number = 1000): Promise<void> {
    await Promise.all([
      this.requestLimiter.consume(1),
      this.tokenLimiter.consume(estimatedTokens)
    ]);
  }

  /**
   * Get current capacity status
   */
  getStatus(): {
    requestsAvailable: number;
    tokensAvailable: number;
    requestsMax: number;
    tokensMax: number;
  } {
    return {
      requestsAvailable: Math.floor(this.requestLimiter.getAvailableTokens()),
      tokensAvailable: Math.floor(this.tokenLimiter.getAvailableTokens()),
      requestsMax: config.get('rateLimit').requestsPerMinute,
      tokensMax: config.get('rateLimit').tokensPerMinute
    };
  }

  /**
   * Reset all limiters
   */
  reset(): void {
    this.requestLimiter.reset();
    this.tokenLimiter.reset();
    logger.info('Rate limiters reset');
  }
}

/**
 * Global rate limiter instance
 */
export const rateLimiter = new SmartRateLimiter();
