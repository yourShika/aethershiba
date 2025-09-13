// events/interactionCreate.ts

import { Events, Client, MessageFlags } from 'discord.js';
import { logger } from '../lib/logger.js';
import { commandHandler } from '../handlers/commandHandler.js';
import { HOUSING_PREFIX } from '../const/constants.js';
import { PROFILE_PREFIX } from '../const/constants.js';
import { ERROR_OCCURED, UNHANDLED_INTERACTION, UNKOWN_ACTION } from '../const/messages.js';

/**
 * Register the "interactionCreate" event handler.
 * 
 * This event fires every time a user interacts with the bot.
 * including:
 *  - Slash commands (/command)
 *  - Autocomplete quaries
 *  - Buttons, select menus (UI interactions)
 * 
 * Flow:
 *  - Route chat input commands and autocomplete to the commandHandler
 *  - Handle button/select interactions.
 *      - Ignore housing interactions (handled separately via HOUSING_PREFIX).
 *      - Otherwise, log a warning and reply with a generic fallback message.
 *  - Catch errors, log them, and reply with a safe error message.
 */
export function register(client: Client) {
    client.on(Events.InteractionCreate, async (interaction) => {
        try {

            // Slash commands & autocomplete -> handled by commandHandler
            if (interaction.isChatInputCommand() || interaction.isAutocomplete()) {
                await commandHandler.handle(interaction);

            // UI components (button, select menus)
            } else if (
                interaction.isButton() ||
                interaction.isStringSelectMenu() ||
                interaction.isChannelSelectMenu() ||
                interaction.isUserSelectMenu() ||
                interaction.isRoleSelectMenu()
            ) {
                // Ignore housing-specific UI elements (custom handlers elsewhere)
                if (interaction.customId?.startsWith(HOUSING_PREFIX)) {
                    return;
                }

                if (interaction.customId?.startsWith(PROFILE_PREFIX)) {
                    return;
                }

                // Otherwise -> log as unhandled
                logger.warn(`${UNHANDLED_INTERACTION}: ${interaction.customId}`);

                // Send fallback message (ephemeral so only user sees it)
                if (interaction.isRepliable()) {
                    const reply = {
                        content: `${UNKOWN_ACTION}`,
                        flags: MessageFlags.Ephemeral,
                    } as const;

                    // If already replied or deferred, use followUp; else reply
                    if (interaction.deferred || interaction.replied) {
                        await interaction.followUp(reply);
                    } else {
                        await interaction.reply(reply);
                    }
                }
            }
        } catch (error) {
            // Catch-all error handler
            logger.error('❌ Error executing command:', error);
            if (interaction.isRepliable()) {
                const reply = { content: `${ERROR_OCCURED}`, flags: MessageFlags.Ephemeral } as const;
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp(reply);
                } else {
                    await interaction.reply(reply);
                }
            }
        }
    });
}

// Default export (for automatic event registration in event loaders)
export default { register };

