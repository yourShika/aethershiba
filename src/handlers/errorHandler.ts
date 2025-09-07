// handlers/errorHandler.ts

import { logger } from '../lib/logger.js';

/**
 * Simple helper to log errors with a contextual message.
 * Keeps error handling consistent across the project.
 * 
 * Usage:
 *  logError("Failed to fetch user", err);
 */

export function logError(context: string, err: unknown) {
  // Always log the error with context using logger.error
  // This ensures that critical issues are visible in production logs.
  logger.error(`❌ ${context}:`, err);
}

