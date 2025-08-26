import { logger } from '../lib/logger.js';

/**
 * Simple helper to log errors with a contextual message.
 * Keeps error handling consistent across the project.
 */
export function logError(context: string, err: unknown) {
  logger.error(`❌ ${context}:`, err);
}

