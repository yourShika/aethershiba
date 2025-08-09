import type { Command } from './types.js';
import config from './config.js';
import help from './help.js';

export const commands: Command[] = [config, help];
