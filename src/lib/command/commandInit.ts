// Entry point for command registration. Each command module
// exports an object implementing the Command interface.
import type { Command } from './commandHandler.js';
import config from '../../commands/config/config.js';
import help from '../../commands/help.js';

// Array of all available commands used when registering slash commands
// and resolving interactions at runtime.
export const commands: Command[] = [config, help];
