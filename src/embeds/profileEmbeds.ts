// embeds/profileEmbeds.ts

import { EmbedBuilder, Colors } from "discord.js";

export const linkStartEmbed = () => 
    new EmbedBuilder()
        .setColor(Colors.Blurple)
        .setTitle('🔗 Link FFXIV Profile')
        .setDescription("Press **Start Verify** and provide your Lodestone URL to begin the verification process.")
        .setFooter({ text: "Final Fantasy XIV Lodestone Verification" });

export const tokenEmbed = (token: string, status?: string) => {
    const embed = new EmbedBuilder()
        .setColor(Colors.Orange)
        .setTitle('📝 Lodestone Verification')
        .setDescription("Add the following token to your Lodestone profile **comment section** and press **Verify**.")
        .addFields(
            { name: '🔑 Token', value: `\`${token}\``, inline: true}, 
            { name: '⏰ Expires', value: '60 minutes', inline: true }
        )
        .setFooter({ text: "Make sure to save the comment before verifying!" });

    if (status) embed.addFields({ name: '📌 Status', value: status });
    return embed;
}

export const successEmbed = (url: string) =>
    new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('✅ Verification successful!')
        .setDescription(`Your FFXIV-Account has been linked to your Discord Account. (Comment can now be deleted from Lodestone!)`)
        .addFields(
            { name: 'Lodestone Account', value: `[View Lodestone Profile](${url})`}
        )
        .setFooter({ text: "Welcome aboard, Warrior of Light!" });
