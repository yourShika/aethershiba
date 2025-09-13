// comamnds/config/housingConfig.ts

import { ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ChannelSelectMenuBuilder,
    ChannelType,
    UserSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    type ChatInputCommandInteraction,
 } from "discord.js";
import type { ConfigSubcommand } from "./config";
import { configManager } from "../../handlers/configHandler";
import { DATACENTERS, DISTRICT_OPTIONS } from "../../const/housing";
import { getWorldNamesByDC } from "../../functions/housing/housingWorlds";
import { uiKey, setDraft } from "../../ui/housingUI";
import { logError } from "../../handlers/errorHandler.js";
import { HOUSING_PREFIX } from "../../const/constants";
import { FAILED_CONFIG_LOADING } from "../../const/messages";

// Prefix used to namespace customID values for all housing config UI components.
// This makes routing component interactions straightforward.

/**
 * Main executor for the "config housing" subcommand.
 * Builds to ephemeral messages (to respect Discord's max 5 rows per message)
 * with select menus und buttons, initializes a per-user draft from current config,
 * and persists changes as users interact.
 * 
 * @param interaction - Discord Chat Input Command Interaction
 */
async function handle(interaction: ChatInputCommandInteraction) {
    try {

      // Load and normalize current guild config
      const guildID = interaction.guildId!;
      const config = await configManager.get(guildID);
      const h = (config['housing'] as any) ?? {};

      // Ensure we always have a datacenter; "Light" is the default.
      const dc = String(h.dataCenter ?? 'Light');

      // Fetch worlds for the selected DC and filter any stale values present in config.
      const worldNames = await getWorldNamesByDC(dc);
      const worlds = Array.isArray(h.worlds)
          ? h.worlds.filter((w: string) => worldNames.includes(w))
          : h.world ? [h.world].filter((w: string) => worldNames.includes(w)) : [];

      // Initialize/merge the per-user draft for this guild
      // Keyed by (guildId:userId) so concurrent admins don't clash.
      const k = uiKey(guildID, interaction.user.id);
      setDraft(k, {
          enabled: Boolean(h.enabled),
          dataCenter: dc,
          worlds,
          districts: h.districts ?? [],
          channelId: h.channelId,
          timesPerDay: h.timesPerDay,
          pingUserId: h.pingUserId,
          pingRoleId: h.pingRoleId,
      });

    // Datacenter select (single)
    const dcRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(HOUSING_PREFIX + "dc")
        .setPlaceholder("Datacenter")
        .addOptions(
          DATACENTERS.map(d =>
            new StringSelectMenuOptionBuilder()
              .setLabel(d)
              .setValue(d)
              .setDefault(d === dc)   // Mark current DC as selected
          ),
        )
        .setMinValues(1)
        .setMaxValues(1),
    );
    
    // World multi-select (depends on DC)
    const worldRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(HOUSING_PREFIX + "world")
        .setPlaceholder("Worlds")
        .addOptions(
          worldNames.slice(0, 25).map(w =>
            new StringSelectMenuOptionBuilder()
              .setLabel(w)
              .setValue(w)
              .setDefault(worlds.includes(w))   // Preserve current selections
          ),
        )
        .setMinValues(1)
        .setMaxValues(Math.min(25, worldNames.length)),
    );
    
    // District multi-select
    const distRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(HOUSING_PREFIX + "districts")
        .setPlaceholder("Districts (mehrfach)")
        .addOptions(
          DISTRICT_OPTIONS.map(opt =>
            new StringSelectMenuOptionBuilder()
              .setLabel(opt.label)
              .setValue(opt.value)
              .setDefault((h.districts ?? []).includes(opt.value))   // Preselect existing districts
          ),
        )
        .setMinValues(1)
        .setMaxValues(Math.min(5, DISTRICT_OPTIONS.length)),
    );

  // Target channel selector (forum)
  const chBuilder = new ChannelSelectMenuBuilder()
    .setCustomId(HOUSING_PREFIX + "channel")
    .setPlaceholder("Zielkanal")
    .addChannelTypes(ChannelType.GuildForum)
    .setMinValues(0)
    .setMaxValues(1);
  if (h.channelId) chBuilder.setDefaultChannels(h.channelId);
  const chRow = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(chBuilder);

  // Optional ping user selector
  const userBuilder = new UserSelectMenuBuilder()
    .setCustomId(HOUSING_PREFIX + "pinguser")
    .setPlaceholder("Ping User")
    .setMinValues(0)
    .setMaxValues(1);
  if (h.pingUserId) userBuilder.setDefaultUsers(h.pingUserId);
  const userRow = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(userBuilder);

  // Optional ping role selector (rendered in a follow-up due to row limits)
  const roleBuilder = new RoleSelectMenuBuilder()
    .setCustomId(HOUSING_PREFIX + "pingrole")
    .setPlaceholder("Ping Role")
    .setMinValues(0)
    .setMaxValues(1);
  if (h.pingRoleId) roleBuilder.setDefaultRoles(h.pingRoleId);
  const roleRow = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleBuilder);

  // Control buttons: enable/disable + open scheduler
  const btnRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(HOUSING_PREFIX + "toggle")
      .setLabel(h.enabled ? "Disable" : "Enable")
      .setStyle(h.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(HOUSING_PREFIX + "schedule")
      .setLabel("Schedule…")
      .setStyle(ButtonStyle.Secondary),
  );

  // First message: summary + first five rows
  await interaction.reply({
    content: summaryContent({
      enabled: Boolean(h.enabled),
      dc,
      worlds,
      districts: h.districts ?? [],
      channelId: h.channelId,
      timesPerDay: h.timesPerDay,
      pingUserId: h.pingUserId,
      pingRoleId: h.pingRoleId,
    }),
    components: [dcRow, worldRow, distRow, chRow, userRow],
    flags: MessageFlags.Ephemeral,
  });

  // After sending, fetch the reply so we can store the message ID in the draft.
  // This allows other interaction handlers to update the summary later.
  const mainMsg = await interaction.fetchReply();

  // Second message: remaining selectors + action buttons
  setDraft(k, { messageId: mainMsg.id });

  await interaction.followUp({
    content: 'Weitere Optionen:',
    components: [roleRow, btnRow],
    flags: MessageFlags.Ephemeral,
  });
    } catch (err) {
      // Log and inform the user if anything goes wrong while building the UI.
        logError('housing config handle', err);
        if (interaction.isRepliable()) {
            await interaction.reply({ content: `${FAILED_CONFIG_LOADING}`, flags: MessageFlags.Ephemeral });
        }
    }
}

/**
 * Renders the summary text block shown above the controls.
 * Keeps the user oriented and mirrors the currently selected values.
 * 
 * @param s - Summary
 * @returns - Formatted Summary
 */
export function summaryContent(s: {
  enabled: boolean;
  dc: string;
  worlds: string[];
  districts: string[];
  channelId?: string;
  timesPerDay?: number;
  pingUserId?: string;
  pingRoleId?: string;
}) {
  return `**Housing-Konfiguration**
- Enabled: ${s.enabled ? "ON" : "OFF"}
- DC: ${s.dc}
- Worlds: ${s.worlds.join(", ") || "—"}
- Districts: ${s.districts.join(", ") || "—"}
- Channel: ${s.channelId ? `<#${s.channelId}>` : "—"}
- Auto: ${s.timesPerDay ? `${s.timesPerDay}×/Tag` : "—"}
- Ping User: ${s.pingUserId ? `<@${s.pingUserId}>` : "—"}
- Ping Role: ${s.pingRoleId ? `<@&${s.pingRoleId}>` : "—"}`;
}

// Subcommand registration object consumed by the config command.
const subcmd: ConfigSubcommand = {
  name: "housing",
  description: "Housing-Überwachung konfigurieren",
  execute: handle,
};


export default subcmd;

