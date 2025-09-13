// handlers/commandInit.ts

// ---------------------------------------------------
// Entry point for command registration. 
// ---------------------------------------------------
// Each command is implemented in its own module and must
// export an object that implements the Command interface.
// This file imports those modules and aggregates them into
// a single list used by the command handler.
// ---------------------------------------------------

import type { Command } from './commandHandler.js';

// Individual command modules
import config from '../commands/config/config.js';          // /config command
import help from '../commands/help/help.js';                // /help command
import housing from '../commands/housing/housing.js';       // /housing command
import profile from '../commands/profile/profile.js';

/**
 * Array of all available commands.
 * 
 *  - Used when registering slash commands with Discord.
 *  - Also used at runtime to resolve incoming interactions
 *    to the correct command handler.
 */
export const commands: Command[] = [config, help, housing, profile];
