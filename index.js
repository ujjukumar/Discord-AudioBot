require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  Events,
  SlashCommandBuilder,
  REST,
  Routes,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");

function assertEnv() {
  const errors = [];
  if (!process.env.DISCORD_TOKEN)
    errors.push("DISCORD_TOKEN is missing in .env");
  // Optional: FFmpeg path check can be done in Menu.checkDependencies
  if (errors.length) {
    console.error("Environment validation failed:\n- " + errors.join("\n- "));
    process.exit(1);
  }
}
assertEnv();
const { VoiceConnectionStatus } = require("@discordjs/voice");
const Menu = require("./src/cli/Menu");
const StreamManager = require("./src/StreamManager");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const streamManager = new StreamManager();
let config = {};
let disconnectTimer = null;

// Register Slash Commands
async function registerCommands(clientId) {
  const commands = [
    new SlashCommandBuilder()
      .setName("join")
      .setDescription("Joins your voice channel and starts streaming"),
    new SlashCommandBuilder()
      .setName("leave")
      .setDescription("Stops streaming and leaves the voice channel"),
  ].map((command) => command.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log("Started refreshing application (/) commands.");
    // Register commands globally (might take time to cache, but easiest for single-bot usage)
    // For instant update in dev, usually guild-specific is used, but we'll try global first.
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error(error);
  }
}

// Main Start Sequence
(async () => {
  config = await Menu.run();
  console.log("Starting Bot...");
  client.login(process.env.DISCORD_TOKEN);
})();

client.once(Events.ClientReady, async (c) => {
  console.log(`\n🤖 Bot Ready! Logged in as ${c.user.tag}`);
  console.log(`👉 Mode: ${config.mode === "device" ? "Device" : "App"}`);
  console.log(`⏱️  Auto-Disconnect: ${config.autoDisconnectTimeout} minutes`);

  await registerCommands(c.user.id);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[Bot] Shutting down gracefully...");
  streamManager.disconnect();
  setTimeout(() => process.exit(0), 1000);
});

// Dashboard Generator
function createDashboard(status = "playing") {
  const isPaused = status === "paused";

  const embed = new EmbedBuilder()
    .setColor(isPaused ? 0xffa500 : 0x0099ff)
    .setTitle("🎧 AudioBot Control Panel")
    .setDescription(
      `Streaming **${config.mode === "device" ? "Device Audio" : "App Audio"}**`,
    )
    .addFields(
      {
        name: "Status",
        value: isPaused ? "⏸️ Paused" : "🟢 Live",
        inline: true,
      },
      {
        name: "Source",
        value: config.mode === "device" ? "Input Device" : `PID: ${config.pid}`,
        inline: true,
      },
    )
    .setFooter({
      text: `Auto-disconnect: ${config.autoDisconnectTimeout}m if empty`,
    });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("toggle_pause")
      .setLabel(isPaused ? "Resume Stream" : "Pause Stream")
      .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("leave_channel")
      .setLabel("Disconnect")
      .setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row] };
}

// Interaction Handler
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "join") {
      const channel = interaction.member?.voice.channel;
      if (!channel)
        return interaction.reply({
          content: "❌ Join a voice channel first!",
          ephemeral: true,
        });

      await interaction.deferReply();

      try {
        const connection = streamManager.join(channel);

        connection.on(VoiceConnectionStatus.Ready, () => {
          console.log("Voice Connection Ready");

          if (config.mode === "device") {
            streamManager.startStreaming(config.device);
          } else {
            streamManager.startAppStreaming(config.pid);
          }

          interaction.editReply(createDashboard());
        });
      } catch (error) {
        console.error(error);
        interaction.editReply({ content: "❌ Failed to join or stream." });
      }
    }

    if (interaction.commandName === "leave") {
      streamManager.disconnect();
      await interaction.reply({ content: "👋 Disconnected." });
    }
  } else if (interaction.isButton()) {
    if (interaction.customId === "toggle_pause") {
      const status = streamManager.togglePause();
      await interaction.update(createDashboard(status));
    }
    if (interaction.customId === "leave_channel") {
      streamManager.disconnect();
      await interaction.update({ content: "👋 Disconnected.", components: [] });
    }
  }
});

// Auto-Disconnect Logic
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  // Check if the update involves the bot's channel
  const botId = client.user.id;
  const botChannel = newState.guild.members.cache.get(botId)?.voice.channel;

  if (!botChannel) {
    // Bot is not in a channel, clear any timer
    if (disconnectTimer) {
      clearTimeout(disconnectTimer);
      disconnectTimer = null;
    }
    return;
  }

  // Check if bot is alone
  if (botChannel.members.size === 1) {
    if (!disconnectTimer) {
      console.log(
        `[Auto-Disconnect] Bot is alone. Timer started (${config.autoDisconnectTimeout}m).`,
      );
      disconnectTimer = setTimeout(
        () => {
          if (botChannel.members.size === 1) {
            console.log("[Auto-Disconnect] Timeout reached. Leaving channel.");
            streamManager.disconnect();
          }
        },
        config.autoDisconnectTimeout * 60 * 1000,
      );
    }
  } else {
    // Bot is not alone
    if (disconnectTimer) {
      console.log("[Auto-Disconnect] Users present. Timer cancelled.");
      clearTimeout(disconnectTimer);
      disconnectTimer = null;
    }
  }
});
