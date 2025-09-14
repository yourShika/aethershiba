// events/housing/housingInteraction.ts

import { 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder,
    ChannelSelectMenuBuilder, 
    ChannelType, 
    UserSelectMenuBuilder, 
    RoleSelectMenuBuilder,
    Client, 
    Events, 
    MessageFlags, 
    type RepliableInteraction 
} from 'discord.js';
import { summaryContent } from '../commands/config/housingConfig.js';
import { DATACENTERS, DISTRICT_OPTIONS } from '../const/housing.js';
import { uiKey, setDraft, getDraft } from '../ui/housingUI.js';
import { configManager } from '../handlers/configHandler.js';
import { logger } from '../lib/logger.js';
import { getWorldNamesByDC } from '../functions/housing/housingWorlds.js';
import { HOUSING_PREFIX } from '../const/constants.js';
import { ERROR_OCCURRED, UNKNOWN_ACTION } from '../const/messages.js';

/**
 * Send a short-lived (ephemeral) follow-up and remove if after 5 seconds.
 * Useful for quick confirmations without cluttering the UI.
 * 
 * @param interaction - Bot Interaction Message
 * @param content - Message Content
 */
async function transientReply(interaction: RepliableInteraction, content: string) {
    const msg = await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    setTimeout(() => interaction.webhook.deleteMessage(msg.id).catch(() => {}), 5000);
    return msg;
}

/**
 * Re-render the summary message (stored by messageId in the draft).
 * This keeps the "live preview" in sync with the latest selections.
 * 
 * @param interaction - Bot Interaction
 * @param key - Draft Key /ui
 */
async function refreshSummary(interaction: RepliableInteraction, key: string) {
    
    // Get Message Draft from the /ui/housingUI.ts
    const draft = getDraft(key);
    const msgId = draft?.messageId;
    if (!draft || !msgId) return;

    // Update Config Message "Live Preview"
    try {
        await interaction.webhook.editMessage(msgId, {
            content: summaryContent({
                enabled: draft.enabled,
                dc: draft.dataCenter ?? 'Light',
                worlds: draft.worlds ?? [],
                districts: draft.districts ?? [],
                ...(draft.channelId ? { channelId: draft.channelId } : {}),
                ...(draft.timesPerDay !== undefined ? { timesPerDay: draft.timesPerDay } : {}),
                ...(draft.pingUserId ? { pingUserId: draft.pingUserId } : {}),
                ...(draft.pingRoleId ? { pingRoleId: draft.pingRoleId } : {}),
            }),
        });
    } catch (err) {
        logger.warn('Failed to refresh housing summary', err);
    }
}

/**
 * Build the select row for "runs per day" (1-3)
 */
function buildTimesRow(selected?: number) {
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(HOUSING_PREFIX + 'times')
            .setPlaceholder('Runs per day')
            .addOptions(
                [1, 2, 3].map(n =>
                    new StringSelectMenuOptionBuilder()
                        .setLabel(`${n}×/Tag`)
                        .setValue(String(n))
                        .setDefault(selected === n)
                ),
            )
            .setMinValues(1)
            .setMaxValues(1),
    );
}


/**
 * Register handlers for all housing-related UI interactions.
 * Handles component interactions whose customId start with HOUSING_PREFIX.
 * @param client - Discord Client
 */
export function register(client: Client) {
    client.on(Events.InteractionCreate, async (interaction) => {
        try {
            // Only handle component interactions; slash commands/autocomplete are handled elsewhere.
            if (
                !(interaction.isButton() ||
                  interaction.isStringSelectMenu() ||
                  interaction.isChannelSelectMenu() ||
                  interaction.isUserSelectMenu() ||
                  interaction.isRoleSelectMenu())
            ) {
                return;
            }

            // Ensure correct namespace and guild context.
            const customId = interaction.customId ?? '';
            if (!customId.startsWith(HOUSING_PREFIX) || !interaction.guildId) {
                return;
            }

            // Action name without the prefix (e.g., "dc", "world", "toggle", etc.)
            const action = customId.slice(HOUSING_PREFIX.length);

            // Draft key is scoped by (guildId, userId) -> each user edits their own draft per guild
            const key = uiKey(interaction.guildId, interaction.user.id);

            switch (action) {
                case 'dc':
                    // Datacenter selection changed
                    if (interaction.isStringSelectMenu()) {
                        const dc = interaction.values[0]!;
                        const worldNames = await getWorldNamesByDC(dc);

                        // Update in-memory draft & persist to config (shallow merge)
                        const draft = setDraft(key, { dataCenter: dc, worlds: [] });
                        await configManager.update(interaction.guildId, 'housing', draft);

                        // Rebuild DC row (with default) and World row (from selected DC)
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

                        // Replace rows 0 & 1 with updated controls, keep the rest intact
                        const rows: any[] = [...interaction.message.components];
                        rows[0] = dcRow;
                        rows[1] = worldRow;

                        await interaction.update({ components: rows });
                        await refreshSummary(interaction, key);
                        await transientReply(interaction, `Datacenter auf **${dc}** gesetzt.`);
                    }
                    break;

                case 'world':
                    // Worlds selection changed (multi-select)
                    if (interaction.isStringSelectMenu()) {
                        const worlds = interaction.values;

                        // Update draft & persist
                        const draft = setDraft(key, { worlds });
                        await configManager.update(interaction.guildId, 'housing', draft);

                        // Rebuild the world row to reflect default selections
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
                    // Districts selection changed (multi-select)
                    if (interaction.isStringSelectMenu()) {
                        const districts = interaction.values;

                        // Update draft & persist
                        const draft = setDraft(key, { districts });
                        await configManager.update(interaction.guildId, 'housing', draft);

                        // Rebuild the districts row with default selections
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
                    // Target channel selection (single)
                    if (interaction.isChannelSelectMenu()) {
                        const channel = interaction.channels.first();

                        // Build patch: set or clear channelId
                        const patch: any = channel ? { channelId: channel.id } : { channelId: undefined };

                        // Update draft & persist
                        const draft = setDraft(key, patch);
                        await configManager.update(interaction.guildId, 'housing', draft);

                        // Rebuild the channel row with default channel
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
                    // Optional ping user (single)
                    if (interaction.isUserSelectMenu()) {
                        const user = interaction.users.first();
                        const patch: any = user ? { pingUserId: user.id } : { pingUserId: undefined };

                        // Update draft & persist
                        const draft = setDraft(key, patch);
                        await configManager.update(interaction.guildId, 'housing', draft);

                        // Rebuild the user select with default
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
                    // Optional ping role (single)
                    if (interaction.isRoleSelectMenu()) {
                        const role = interaction.roles.first();
                        const patch: any = role ? { pingRoleId: role.id } : { pingRoleId: undefined };

                        // Update draft & persist
                        const draft = setDraft(key, patch);
                        await configManager.update(interaction.guildId, 'housing', draft);

                        // Rebuild the role select with default
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
                    // Enable/disable housing feature
                    if (interaction.isButton()) {
                        const current = getDraft(key)?.enabled ?? false;

                        // Defer to avoid "This interaction failed" while we process
                        await interaction.deferUpdate();

                        // Toggle flag in draft & persist
                        const draft = setDraft(key, { enabled: !current });
                        await configManager.update(interaction.guildId, 'housing', draft);

                        await refreshSummary(interaction, key);
                        await transientReply(interaction, `Housing ist jetzt ${draft.enabled ? 'aktiviert' : 'deaktiviert'}.`);
                    }
                    break;

                case 'schedule':
                    // Open ephemeral scheduler config (times per day)
                    if (interaction.isButton()) {
                        const draft = getDraft(key);

                        await interaction.deferUpdate();
                        await interaction.followUp({
                            content: 'Automatische Aktualisierung konfigurieren:',
                            components: [buildTimesRow(draft?.timesPerDay)],
                            flags: MessageFlags.Ephemeral,
                        });
                    }
                    break;

                case 'times':
                    // Persist selected runs per day (1-3)
                    if (interaction.isStringSelectMenu()) {
                        const timesPerDay = Number(interaction.values[0]);

                        // Update draft & persist
                        const draft = setDraft(key, { timesPerDay });
                        await configManager.update(interaction.guildId, 'housing', draft);

                        // Replace the select row in the ephemeral message
                        const rows: any[] = [...interaction.message.components];
                        rows[0] = buildTimesRow(timesPerDay);

                        await interaction.update({ components: rows });
                        await refreshSummary(interaction, key);
                        await transientReply(interaction, `Runs pro Tag auf **${timesPerDay}** gesetzt.`);
                    }
                    break;

                default:
                    // Anything unrecognized under HOUSING_PREFIX
                    logger.warn(`Unhandled housing interaction: ${customId}`);

                    if (interaction.isRepliable()) {
                        await interaction.reply({
                            content: `${UNKNOWN_ACTION}`,
                            flags: MessageFlags.Ephemeral,
                        });
                    }
                    break;

            }
        } catch (err) {
            // Catch-all to avoid crashin the event loop; always respond ephemerally if possible.
            logger.error('❌ Fehler in housing interaction:', err);
            if (interaction.isRepliable()) {
                const reply = { content: `${ERROR_OCCURRED}`, flags: MessageFlags.Ephemeral } as const;
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp(reply);
                } else {
                    await interaction.reply(reply);
                }
            }
        }
    });
}

// Export as default to the client
export default { register };

