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
import profile from '../commands/profile/profile.js';       // /profile command
import admin from '../commands/admin/admin.js';             // /admin command
import market from '../commands/market/market.js';
import resets from '../commands/resets/resets.js';
import hunt from '../commands/hunt/hunt.js';
import saucer from '../commands/saucer/saucer.js';
import events from '../commands/events/events.js';
import fashion from '../commands/fashion/fashion.js';
import tripletriad from '../commands/tripletriad/tripletriad.js';
import quiz from '../commands/quiz/quiz.js';
import news from '../commands/news/news.js';

/**
 * Array of all available commands.
 * 
 *  - Used when registering slash commands with Discord.
 *  - Also used at runtime to resolve incoming interactions
 *    to the correct command handler.
 */
export const commands: Command[] = [
    admin,
    config,
    events,
    fashion,
    help,
    housing,
    hunt,
    market,
    news,
    profile,
    quiz,
    resets,
    saucer,
    tripletriad,
];
