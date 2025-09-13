import { Client, Events, MessageFlags } from "discord.js";
import { PROFILE_PREFIX } from "../const/constatns";

export function register(client: Client) {
    client.on(Events.InteractionCreate, async (interaction) => {
        if (!interaction.isButton()) return;
        if (!interaction.customId.startsWith(PROFILE_PREFIX)) return;

    });
}

export default { register };