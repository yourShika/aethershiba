import { Client, Events, MessageFlags } from 'discord.js';
import { HOUSING_PREFIX } from '../../commands/config/housingConfig.js';
import { uiKey, setDraft, getDraft, clearDraft } from '../../ui/housingUI.js';
import { configManager } from '../../lib/config/configHandler.js';
import { logger } from '../../lib/logger.js';

/**
 * Handles all interactions related to the housing configuration UI.
 */
export function register(client: Client) {
    client.on(Events.InteractionCreate, async (interaction) => {
        try {
            if (
                !(interaction.isButton() ||
                  interaction.isStringSelectMenu() ||
                  interaction.isChannelSelectMenu() ||
                  interaction.isUserSelectMenu() ||
                  interaction.isRoleSelectMenu())
            ) {
                return;
            }

            const customId = interaction.customId ?? '';
            if (!customId.startsWith(HOUSING_PREFIX) || !interaction.guildId) {
                return;
            }

            const action = customId.slice(HOUSING_PREFIX.length);
            const key = uiKey(interaction.guildId, interaction.user.id);

            switch (action) {
                case 'dc':
                    if (interaction.isStringSelectMenu()) {
                        const dc = interaction.values[0]!;
                        setDraft(key, { dataCenter: dc });
                        await interaction.reply({
                            content: `Datacenter auf **${dc}** gesetzt.`,
                            flags: MessageFlags.Ephemeral,
                        });
                    }
                    break;
                case 'world':
                    if (interaction.isStringSelectMenu()) {
                        const world = interaction.values[0]!;
                        setDraft(key, { world });
                        await interaction.reply({
                            content: `World auf **${world}** gesetzt.`,
                            flags: MessageFlags.Ephemeral,
                        });
                    }
                    break;
                case 'districts':
                    if (interaction.isStringSelectMenu()) {
                        const districts = interaction.values;
                        setDraft(key, { districts });
                        await interaction.reply({
                            content: `Districts aktualisiert.`,
                            flags: MessageFlags.Ephemeral,
                        });
                    }
                    break;
                case 'channel':
                    if (interaction.isChannelSelectMenu()) {
                        const channel = interaction.channels.first();
                        const patch: any = channel ? { channelId: channel.id } : { channelId: undefined };
                        setDraft(key, patch);
                        await interaction.reply({
                            content: channel ? `Kanal auf <#${channel.id}> gesetzt.` : 'Kanal entfernt.',
                            flags: MessageFlags.Ephemeral,
                        });
                    }
                    break;
                case 'pinguser':
                    if (interaction.isUserSelectMenu()) {
                        const user = interaction.users.first();
                        const patch: any = user ? { pingUserId: user.id } : { pingUserId: undefined };
                        setDraft(key, patch);
                        await interaction.reply({
                            content: user ? `Ping-User auf <@${user.id}> gesetzt.` : 'Ping-User entfernt.',
                            flags: MessageFlags.Ephemeral,
                        });
                    }
                    break;
                case 'pingrole':
                    if (interaction.isRoleSelectMenu()) {
                        const role = interaction.roles.first();
                        const patch: any = role ? { pingRoleId: role.id } : { pingRoleId: undefined };
                        setDraft(key, patch);
                        await interaction.reply({
                            content: role ? `Ping-Rolle auf <@&${role.id}> gesetzt.` : 'Ping-Rolle entfernt.',
                            flags: MessageFlags.Ephemeral,
                        });
                    }
                    break;
                case 'toggle':
                    if (interaction.isButton()) {
                        const current = getDraft(key)?.enabled ?? false;
                        const draft = setDraft(key, { enabled: !current });
                        await interaction.reply({
                            content: `Housing ist jetzt ${draft.enabled ? 'aktiviert' : 'deaktiviert'}.`,
                            flags: MessageFlags.Ephemeral,
                        });
                    }
                    break;
                case 'schedule':
                    if (interaction.isButton()) {
                        await interaction.reply({
                            content: 'Planung noch nicht implementiert.',
                            flags: MessageFlags.Ephemeral,
                        });
                    }
                    break;
                case 'save':
                    if (interaction.isButton()) {
                        const draft = getDraft(key);
                        if (draft) {
                            await configManager.update(interaction.guildId, 'housing', draft);
                            clearDraft(key);
                            await interaction.reply({
                                content: 'Housing-Konfiguration gespeichert.',
                                flags: MessageFlags.Ephemeral,
                            });
                        } else {
                            await interaction.reply({
                                content: 'Keine Änderungen zum Speichern.',
                                flags: MessageFlags.Ephemeral,
                            });
                        }
                    }
                    break;
                case 'cancel':
                    if (interaction.isButton()) {
                        clearDraft(key);
                        await interaction.reply({
                            content: 'Änderungen verworfen.',
                            flags: MessageFlags.Ephemeral,
                        });
                    }
                    break;
                default:
                    logger.warn(`Unhandled housing interaction: ${customId}`);
                    if (interaction.isRepliable()) {
                        await interaction.reply({
                            content: 'Diese Aktion ist derzeit nicht verfügbar.',
                            flags: MessageFlags.Ephemeral,
                        });
                    }
                    break;
            }
        } catch (err) {
            logger.error('❌ Fehler in housing interaction:', err);
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
