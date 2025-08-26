import { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
    Client, Events, MessageFlags, type RepliableInteraction } from 'discord.js';
import { HOUSING_PREFIX, summaryContent } from '../../commands/config/housingConfig.js';
import { uiKey, setDraft, getDraft } from '../../ui/housingUI.js';
import { configManager } from '../../handlers/configHandler.js';
import { logger } from '../../lib/logger.js';
import { getWorldNamesByDC } from '../../functions/housing/housingWorlds.js';

/** Sends a short-lived ephemeral notice and removes it after 5 seconds. */
async function transientReply(interaction: RepliableInteraction, content: string) {
    const msg = await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    setTimeout(() => interaction.webhook.deleteMessage(msg.id).catch(() => {}), 5000);
    return msg;
}

/** Re-renders the summary message based on the current draft. */
async function refreshSummary(interaction: RepliableInteraction, key: string) {
    const draft = getDraft(key);
    const msgId = draft?.messageId;
    if (!draft || !msgId) return;
    try {
        await interaction.webhook.editMessage(msgId, {
            content: summaryContent({
                enabled: draft.enabled,
                dc: draft.dataCenter ?? 'Light',
                worlds: draft.worlds ?? [],
                districts: draft.districts ?? [],
                ...(draft.channelId ? { channelId: draft.channelId } : {}),
                ...(draft.timesPerDay !== undefined ? { timesPerDay: draft.timesPerDay } : {}),
                ...(draft.intervalMinutes !== undefined ? { intervalMinutes: draft.intervalMinutes } : {}),
                ...(draft.pingUserId ? { pingUserId: draft.pingUserId } : {}),
                ...(draft.pingRoleId ? { pingRoleId: draft.pingRoleId } : {}),
            }),
        });
    } catch (err) {
        logger.warn('Failed to refresh housing summary', err);
    }
}


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
                        const worldNames = await getWorldNamesByDC(dc);
                        setDraft(key, { dataCenter: dc, worlds: [] });
                        const worldRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId(HOUSING_PREFIX + 'world')
                                .setPlaceholder('Worlds')
                                .addOptions(
                                    worldNames.slice(0, 25).map(w =>
                                        new StringSelectMenuOptionBuilder().setLabel(w).setValue(w)
                                    ),
                                )
                                .setMinValues(1)
                                .setMaxValues(Math.min(25, worldNames.length)),
                        );
                        const rows: any[] = [...interaction.message.components];
                        rows[1] = worldRow;
                        await interaction.update({ components: rows });
                        await refreshSummary(interaction, key);
                        await transientReply(interaction, `Datacenter auf **${dc}** gesetzt.`);
                    }
                    break;
                case 'world':
                    if (interaction.isStringSelectMenu()) {
                        const worlds = interaction.values;
                        await interaction.deferUpdate();
                        setDraft(key, { worlds });
                        await refreshSummary(interaction, key);
                        await transientReply(interaction, `Worlds auf **${worlds.join(', ')}** gesetzt.`);
                    }
                    break;
                case 'districts':
                    if (interaction.isStringSelectMenu()) {
                        const districts = interaction.values;
                        await interaction.deferUpdate();
                        setDraft(key, { districts });
                        await refreshSummary(interaction, key);
                        await transientReply(interaction, `Districts aktualisiert.`);
                    }
                    break;
                case 'channel':
                    if (interaction.isChannelSelectMenu()) {
                        const channel = interaction.channels.first();
                        await interaction.deferUpdate();
                        const patch: any = channel ? { channelId: channel.id } : { channelId: undefined };
                        setDraft(key, patch);
                        await refreshSummary(interaction, key);
                        await transientReply(interaction, channel ? `Kanal auf <#${channel.id}> gesetzt.` : 'Kanal entfernt.');
                    }
                    break;
                case 'pinguser':
                    if (interaction.isUserSelectMenu()) {
                        const user = interaction.users.first();
                        await interaction.deferUpdate();
                        const patch: any = user ? { pingUserId: user.id } : { pingUserId: undefined };
                        setDraft(key, patch);
                        await refreshSummary(interaction, key);
                        await transientReply(interaction, user ? `Ping-User auf <@${user.id}> gesetzt.` : 'Ping-User entfernt.');
                    }
                    break;
                case 'pingrole':
                    if (interaction.isRoleSelectMenu()) {
                        const role = interaction.roles.first();
                        await interaction.deferUpdate();
                        const patch: any = role ? { pingRoleId: role.id } : { pingRoleId: undefined };
                        setDraft(key, patch);
                        await refreshSummary(interaction, key);
                        await transientReply(interaction, role ? `Ping-Rolle auf <@&${role.id}> gesetzt.` : 'Ping-Rolle entfernt.');
                    }
                    break;
                case 'toggle':
                    if (interaction.isButton()) {
                        const current = getDraft(key)?.enabled ?? false;
                        await interaction.deferUpdate();
                        const draft = setDraft(key, { enabled: !current });
                        await refreshSummary(interaction, key);
                        await transientReply(interaction, `Housing ist jetzt ${draft.enabled ? 'aktiviert' : 'deaktiviert'}.`);
                    }
                    break;
                case 'schedule':
                    if (interaction.isButton()) {
                        await interaction.deferUpdate();
                        await transientReply(interaction, 'Planung noch nicht implementiert.');
                    }
                    break;
                case 'save':
                    if (interaction.isButton()) {
                        const draft = getDraft(key);
                        await interaction.deferUpdate();
                        if (draft) {
                            await configManager.update(interaction.guildId, 'housing', draft);
                            await transientReply(interaction, 'Housing-Konfiguration gespeichert.');
                        } else {
                            await transientReply(interaction, 'Keine Änderungen zum Speichern.');
                        }
                        await refreshSummary(interaction, key);
                    }
                    break;
                case 'cancel':
                    if (interaction.isButton()) {
                        const msgId = getDraft(key)?.messageId;
                        const cfg = await configManager.get(interaction.guildId);
                        const h = (cfg['housing'] as any) ?? {};
                        const patch: any = {
                            enabled: Boolean(h.enabled),
                            dataCenter: h.dataCenter,
                            worlds: Array.isArray(h.worlds) ? h.worlds : h.world ? [h.world] : [],
                            districts: h.districts ?? [],
                            channelId: h.channelId,
                            timesPerDay: h.timesPerDay,
                            intervalMinutes: h.intervalMinutes,
                            pingUserId: h.pingUserId,
                            pingRoleId: h.pingRoleId,
                        };
                        if (msgId) patch.messageId = msgId;
                        setDraft(key, patch);
                        await interaction.deferUpdate();
                        await refreshSummary(interaction, key);
                        await transientReply(interaction, 'Änderungen verworfen.');
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

