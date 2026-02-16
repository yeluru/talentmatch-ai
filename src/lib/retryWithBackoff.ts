/**
 * Retry a function with exponential backoff
 * Useful for handling transient network errors in bulk upload operations
 */
export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: RegExp[];
  timeoutMs?: number;
}

const DEFAULT_RETRYABLE_ERRORS = [
  /network/i,
  /timeout/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /fetch failed/i,
  /rate limit/i,
  /429/,
  /503/,
  /502/,
  /504/,
];

/**
 * Wrap a promise with a timeout
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    backoffMultiplier = 2,
    retryableErrors = DEFAULT_RETRYABLE_ERRORS,
    timeoutMs,
  } = options;

  let lastError: Error | unknown;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const fnPromise = fn();
      const result = timeoutMs ? await withTimeout(fnPromise, timeoutMs) : await fnPromise;
      return result;
    } catch (error) {
      lastError = error;

      // Check if this is a retryable error
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isRetryable = retryableErrors.some((pattern) => pattern.test(errorMessage));

      // Don't retry if this is the last attempt or error is not retryable
      if (attempt >= maxRetries || !isRetryable) {
        throw error;
      }

      console.log(`[Retry] Attempt ${attempt + 1}/${maxRetries} failed: ${errorMessage}. Retrying in ${delay}ms...`);

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Increase delay for next attempt (exponential backoff)
      delay = Math.min(delay * backoffMultiplier, maxDelayMs);
    }
  }

  throw lastError;
}

/**
 * Get user-friendly error message from technical error
 */
export function getUserFriendlyErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  // Rate limiting
  if (/rate limit|429/i.test(message)) {
    return 'Too many requests. Please wait a moment and try again.';
  }

  // Network errors
  if (/network|fetch failed|ECONNRESET/i.test(message)) {
    return 'Network error. Please check your connection and try again.';
  }

  // Timeout errors
  if (/timeout|ETIMEDOUT/i.test(message)) {
    return 'Request timed out. The file might be too large or your connection is slow.';
  }

  // Server errors
  if (/503|502|504/i.test(message)) {
    return 'Server is temporarily unavailable. Please try again in a few minutes.';
  }

  // File size errors
  if (/file.*too large|size.*exceed/i.test(message)) {
    return 'File is too large. Maximum file size is 10MB.';
  }

  // Parse errors
  if (/parse|invalid.*format/i.test(message)) {
    return 'Could not parse file. Please ensure it is a valid resume in PDF, DOCX, or TXT format.';
  }

  // Duplicate errors
  if (/duplicate/i.test(message)) {
    return 'This resume has already been uploaded.';
  }

  // Authentication errors
  if (/auth|permission|unauthorized|403/i.test(message)) {
    return 'Permission denied. Please log in again.';
  }

  // Default: return the original message if it's not too technical
  if (message.length < 100 && !/stack trace|at \w+\./i.test(message)) {
    return message;
  }

  return 'An unexpected error occurred. Please try again or contact support.';
}
