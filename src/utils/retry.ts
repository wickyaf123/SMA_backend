import { logger } from './logger';

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  shouldRetry?: (error: any) => boolean;
  onRetry?: (attempt: number, error: any) => void;
}

/**
 * Retry a function with exponential backoff
 * 
 * @param fn - Function to retry
 * @param options - Retry configuration
 * @returns Result of the function
 * 
 * @example
 * const result = await retryWithBackoff(
 *   async () => await apiCall(),
 *   { maxRetries: 3, baseDelay: 1000 }
 * );
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    shouldRetry = () => true,
    onRetry,
  } = options;

  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry if it's the last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Check if we should retry this error
      if (!shouldRetry(error)) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);

      logger.warn({
        attempt: attempt + 1,
        maxRetries,
        delay,
        error: error.message || error,
      }, 'Retrying after error');

      // Call onRetry callback if provided
      if (onRetry) {
        onRetry(attempt + 1, error);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  // All retries exhausted
  logger.error({
    maxRetries,
    error: lastError,
  }, 'All retry attempts exhausted');

  throw lastError;
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable based on HTTP status code
 */
export function isRetryableHttpError(error: any): boolean {
  if (!error.response) {
    // Network errors should retry
    return true;
  }

  const status = error.response.status;

  // Retry on rate limit (429) and server errors (5xx)
  if (status === 429 || status >= 500) {
    return true;
  }

  // Don't retry on client errors (4xx except 429)
  return false;
}

/**
 * Retry specifically for rate-limited APIs
 * Waits for the rate limit reset time if available
 */
export async function retryWithRateLimit<T>(
  fn: () => Promise<T>,
  options: RetryOptions & {
    getRateLimitReset?: (error: any) => number | null;
  } = {}
): Promise<T> {
  const {
    getRateLimitReset,
    ...retryOptions
  } = options;

  return retryWithBackoff(fn, {
    ...retryOptions,
    shouldRetry: (error) => {
      // Check if it's a rate limit error
      if (error.response?.status === 429) {
        if (getRateLimitReset) {
          const resetTime = getRateLimitReset(error);
          if (resetTime) {
            const now = Date.now();
            const waitTime = resetTime - now;
            
            if (waitTime > 0) {
              logger.info({
                resetTime: new Date(resetTime).toISOString(),
                waitTimeSeconds: Math.ceil(waitTime / 1000),
              }, 'Rate limit hit, waiting for reset');
            }
          }
        }
        return true;
      }

      return isRetryableHttpError(error);
    },
  });
}

