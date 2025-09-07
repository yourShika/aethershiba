// lib/logger.ts
// ---------------------------------------------------
// Simple colored logging utilities used throughout the bot.
// Each log message is prefixed with a timestamp and level label.
// ---------------------------------------------------

import chalk from 'chalk';
import { botConfig } from '../config';

// Color function type used to annotate log level labels.
type ColorFn = (s: string) => string;

// Generate a colored timestamp string for console output.
function timestamp() {
    const now = new Date();

    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');

    const yyyy = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');

    return chalk.gray(`[${hh}:${mm}:${ss}] [${yyyy}:${month}:${dd}]`);
}

// Generic log function that handles formatting and color selection.
function log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', color: ColorFn, ...args: unknown[]) {
  console.log(`${timestamp()} [${color(level)}]`, ...args);
}

// Public logger API exposing helpers for each log level.
// 'debug' logs only if botConfig.debug.loggingDebug is true.
export const logger = {
    info: (...args: unknown[]) => log('INFO', chalk.green, ...args),
    warn: (...args: unknown[]) => log('WARN', chalk.yellow, ...args),
    error: (...args: unknown[]) => log('ERROR', chalk.red, ...args),
    debug: (...args: unknown[]) => {
      if (botConfig?.debug?.loggingDebug) {
        log('DEBUG', chalk.cyan, ...args);
      }
    },
};
