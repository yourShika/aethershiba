import { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
    ChannelSelectMenuBuilder, ChannelType, UserSelectMenuBuilder, RoleSelectMenuBuilder,
    Client, Events, MessageFlags, type RepliableInteraction } from 'discord.js';
import { HOUSING_PREFIX, summaryContent } from '../../commands/config/housingConfig.js';
import { DATACENTERS, DISTRICT_OPTIONS } from '../../const/housing/housing.js';
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
                        const draft = setDraft(key, { dataCenter: dc, worlds: [] });
                        await configManager.update(interaction.guildId, 'housing', draft);
                        const dcRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId(HOUSING_PREFIX + 'dc')
                                .setPlaceholder('Datacenter')
                                .addOptions(
                                    DATACENTERS.map(d =>
                                        new StringSelectMenuOptionBuilder()
                                            .setLabel(d)
                                            .setValue(d)
                                            .setDefault(d === dc)
                                    ),
                                )
                                .setMinValues(1)
                                .setMaxValues(1),
                        );
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
                        rows[0] = dcRow;
                        rows[1] = worldRow;
                        await interaction.update({ components: rows });
                        await refreshSummary(interaction, key);
                        await transientReply(interaction, `Datacenter auf **${dc}** gesetzt.`);
                    }
                    break;
                case 'world':
                    if (interaction.isStringSelectMenu()) {
                        const worlds = interaction.values;
                        const draft = setDraft(key, { worlds });
                        await configManager.update(interaction.guildId, 'housing', draft);

                        const worldNames = await getWorldNamesByDC(draft.dataCenter ?? 'Light');
                        const worldRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId(HOUSING_PREFIX + 'world')
                                .setPlaceholder('Worlds')
                                .addOptions(
                                    worldNames.slice(0, 25).map(w =>
                                        new StringSelectMenuOptionBuilder()
                                            .setLabel(w)
                                            .setValue(w)
                                            .setDefault(worlds.includes(w))
                                    ),
                                )
                                .setMinValues(1)
                                .setMaxValues(Math.min(25, worldNames.length)),
                        );
                        const rows: any[] = [...interaction.message.components];
                        rows[1] = worldRow;
                        await interaction.update({ components: rows });
                        await refreshSummary(interaction, key);
                        await transientReply(interaction, `Worlds auf **${worlds.join(', ')}** gesetzt.`);
                    }
                    break;
                case 'districts':
                    if (interaction.isStringSelectMenu()) {
                        const districts = interaction.values;
                        const draft = setDraft(key, { districts });
                        await configManager.update(interaction.guildId, 'housing', draft);

                        const distRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId(HOUSING_PREFIX + 'districts')
                                .setPlaceholder('Districts (mehrfach)')
                                .addOptions(
                                    DISTRICT_OPTIONS.map(opt =>
                                        new StringSelectMenuOptionBuilder()
                                            .setLabel(opt.label)
                                            .setValue(opt.value)
                                            .setDefault(districts.includes(opt.value))
                                    ),
                                )
                                .setMinValues(1)
                                .setMaxValues(Math.min(5, DISTRICT_OPTIONS.length)),
                        );
                        const rows: any[] = [...interaction.message.components];
                        rows[2] = distRow;
                        await interaction.update({ components: rows });
                        await refreshSummary(interaction, key);
                        await transientReply(interaction, `Districts aktualisiert.`);
                    }
                    break;
                case 'channel':
                    if (interaction.isChannelSelectMenu()) {
                        const channel = interaction.channels.first();
                        const patch: any = channel ? { channelId: channel.id } : { channelId: undefined };
                        const draft = setDraft(key, patch);
                        await configManager.update(interaction.guildId, 'housing', draft);
                        const chBuilder = new ChannelSelectMenuBuilder()
                            .setCustomId(HOUSING_PREFIX + 'channel')
                            .setPlaceholder('Zielkanal')
                            .addChannelTypes(ChannelType.GuildText);
                        if (channel) chBuilder.setDefaultChannels(channel.id);
                        const chRow = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(chBuilder);
                        const rows: any[] = [...interaction.message.components];
                        rows[3] = chRow;
                        await interaction.update({ components: rows });
                        await refreshSummary(interaction, key);
                        await transientReply(interaction, channel ? `Kanal auf <#${channel.id}> gesetzt.` : 'Kanal entfernt.');
                    }
                    break;
                case 'pinguser':
                    if (interaction.isUserSelectMenu()) {
                        const user = interaction.users.first();
                        const patch: any = user ? { pingUserId: user.id } : { pingUserId: undefined };
                        const draft = setDraft(key, patch);
                        await configManager.update(interaction.guildId, 'housing', draft);
                        const userBuilder = new UserSelectMenuBuilder()
                            .setCustomId(HOUSING_PREFIX + 'pinguser')
                            .setPlaceholder('Ping User')
                            .setMinValues(0)
                            .setMaxValues(1);
                        if (user) userBuilder.setDefaultUsers(user.id);
                        const userRow = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(userBuilder);
                        const rows: any[] = [...interaction.message.components];
                        rows[4] = userRow;
                        await interaction.update({ components: rows });
                        await refreshSummary(interaction, key);
                        await transientReply(interaction, user ? `Ping-User auf <@${user.id}> gesetzt.` : 'Ping-User entfernt.');
                    }
                    break;
                case 'pingrole':
                    if (interaction.isRoleSelectMenu()) {
                        const role = interaction.roles.first();
                        const patch: any = role ? { pingRoleId: role.id } : { pingRoleId: undefined };
                        const draft = setDraft(key, patch);
                        await configManager.update(interaction.guildId, 'housing', draft);
                        const roleBuilder = new RoleSelectMenuBuilder()
                            .setCustomId(HOUSING_PREFIX + 'pingrole')
                            .setPlaceholder('Ping Role')
                            .setMinValues(0)
                            .setMaxValues(1);
                        if (role) roleBuilder.setDefaultRoles(role.id);
                        const roleRow = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleBuilder);
                        const rows: any[] = [...interaction.message.components];
                        rows[0] = roleRow;
                        await interaction.update({ components: rows });
                        await refreshSummary(interaction, key);
                        await transientReply(interaction, role ? `Ping-Rolle auf <@&${role.id}> gesetzt.` : 'Ping-Rolle entfernt.');
                    }
                    break;
                case 'toggle':
                    if (interaction.isButton()) {
                        const current = getDraft(key)?.enabled ?? false;
                        await interaction.deferUpdate();
                        const draft = setDraft(key, { enabled: !current });
                        await configManager.update(interaction.guildId, 'housing', draft);
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

