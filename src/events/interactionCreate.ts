import { Events, Client, MessageFlags } from 'discord.js';
import { logger } from '../lib/logger.js';
import { commandHandler } from '../lib/command/commandHandler.js';

/**
 * Registers the interactionCreate event used to route interactions
 * to the appropriate command implementation.
 */
export function register(client: Client) {
    client.on(Events.InteractionCreate, async (interaction) => {
        try {
            if (interaction.isChatInputCommand()) {
                await commandHandler.handle(interaction);
            } else if (
                interaction.isButton() ||
                interaction.isStringSelectMenu() ||
                interaction.isChannelSelectMenu() ||
                interaction.isUserSelectMenu() ||
                interaction.isRoleSelectMenu()
            ) {
                logger.warn(`Unhandled interaction: ${interaction.customId}`);
                if (interaction.isRepliable()) {
                    const reply = {
                        content: 'Diese Aktion ist derzeit nicht verfügbar.',
                        flags: MessageFlags.Ephemeral,
                    } as const;
                    if (interaction.deferred || interaction.replied) {
                        await interaction.followUp(reply);
                    } else {
                        await interaction.reply(reply);
                    }
                }
            }
        } catch (error) {
            logger.error('❌ Error executing command:', error);
            if (interaction.isRepliable()) {
                const reply = { content: 'Es ist ein Fehler aufgetreten.', flags: MessageFlags.Ephemeral } as const;
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp(reply);
                } else {
                    await interaction.reply(reply);
                }
            }
        }
    });
}

export default { register };

