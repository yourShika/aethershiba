// Entry point for command registration. Each command module
// exports an object implementing the Command interface.
import type { Command } from './types.js';
import config from './config.js';
import help from './help.js';

// Array of all available commands used when registering slash commands
// and resolving interactions at runtime.
export const commands: Command[] = [config, help];
