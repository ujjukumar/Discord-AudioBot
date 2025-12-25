require('dotenv').config({ path: '../.env' });
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    VoiceConnectionStatus 
} = require('@discordjs/voice');
const { spawn, exec } = require('child_process');
const readline = require('readline');

// CONFIGURATION
const ffmpegPath = 'ffmpeg'; // Ensure 'ffmpeg' is in your PATH

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

let connection = null;
let player = null;
let ffmpegProcess = null;
let selectedAudioDevice = '';

// Interactive CLI Device Selection
async function selectDevice() {
    return new Promise((resolve, reject) => {
        console.log('Scanning audio devices...');
        exec(`"${ffmpegPath}" -list_devices true -f dshow -i dummy`, (error, stdout, stderr) => {
            const output = stderr || stdout;
            const lines = output.split('\n');
            let devices = [];
            
            lines.forEach(line => {
                if (line.includes('(audio)')) {
                    const match = line.match(/"([^"]+)"/);
                    if (match) devices.push(match[1]);
                }
            });

            if (devices.length === 0) {
                console.error('No audio devices found! Check if Stereo Mix is enabled in Windows Sound Settings.');
                process.exit(1);
            }

            console.log('\n=== Available Audio Devices ===');
            devices.forEach((d, i) => console.log(`${i + 1}. ${d}`));
            console.log('===============================');

            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            rl.question('\nEnter number to select device: ', (answer) => {
                const index = parseInt(answer) - 1;
                if (!isNaN(index) && index >= 0 && index < devices.length) {
                    selectedAudioDevice = `audio=${devices[index]}`;
                    console.log(`\nSelected: "${devices[index]}"`);
                    console.log('Starting Bot...');
                    rl.close();
                    resolve();
                } else {
                    console.log('Invalid selection. Exiting.');
                    rl.close();
                    process.exit(1);
                }
            });
        });
    });
}

// Main Start Sequence
(async () => {
    await selectDevice();

    client.once(Events.ClientReady, c => {
        console.log(`Ready! Logged in as ${c.user.tag}`);
    });

    client.login(process.env.DISCORD_TOKEN);
})();

client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

    if (message.content === '!join') {
        const channel = message.member?.voice.channel;
        if (!channel) return message.reply('Join a voice channel first!');

        connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: false
        });

        connection.on(VoiceConnectionStatus.Ready, () => {
            console.log('Voice Connection Ready');
            message.reply('Joined! Streaming...');
            startStreaming();
        });
    }

    if (message.content === '!stop') {
        stopStreaming();
        if (connection) connection.destroy();
        message.reply('Stopped.');
    }
});

function startStreaming() {
    stopStreaming(); 

    player = createAudioPlayer();
    
    console.log(`[FFmpeg] Starting capture on: ${selectedAudioDevice}`);
    
    const args = [
        '-f', 'dshow',
        '-i', selectedAudioDevice,
        '-ac', '2',
        '-ar', '48000',
        '-f', 's16le',
        'pipe:1'
    ];

    ffmpegProcess = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    ffmpegProcess.stderr.on('data', d => {
        const msg = d.toString();
        // Only log errors or device opens, filter frame progress
        if (!msg.includes('size=') && !msg.includes('frame=')) {
             console.log(`[FFmpeg] ${msg.trim()}`);
        }
    });

    const resource = createAudioResource(ffmpegProcess.stdout, { inputType: 'raw' });
    player.play(resource);
    connection.subscribe(player);

    player.on(AudioPlayerStatus.Playing, () => console.log('Audio is streaming.'));
    player.on('error', error => console.error('Player Error:', error.message));
}

function stopStreaming() {
    if (ffmpegProcess) {
        ffmpegProcess.kill();
        ffmpegProcess = null;
    }
    if (player) {
        player.stop();
        player = null;
    }
}
