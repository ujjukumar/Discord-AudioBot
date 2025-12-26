require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { VoiceConnectionStatus } = require('@discordjs/voice');
const { exec, spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const StreamManager = require('./src/StreamManager');

// CONFIGURATION
const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
const audioCaptureExe = path.join(__dirname, 'AudioCapture', 'bin', 'Release', 'net10.0', 'AudioCapture.exe');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const streamManager = new StreamManager();

// Capture mode: 'device' or 'app'
let captureMode = 'device';
let selectedAudioDevice = '';
let selectedAppPid = 0;

// Interactive CLI for Mode Selection
async function selectCaptureMode() {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        console.log('\n=== Audio Capture Mode ===');
        console.log('1. Device Mode - Capture from audio device (Stereo Mix, Microphone, etc.)');
        console.log('2. App Mode    - Capture from a specific application');
        console.log('==========================\n');

        const ask = () => {
            rl.question('Select mode (1 or 2): ', (answer) => {
                if (answer === '1') {
                    captureMode = 'device';
                    rl.close();
                    resolve();
                } else if (answer === '2') {
                    captureMode = 'app';
                    rl.close();
                    resolve();
                } else {
                    console.log('[Error] Please enter 1 or 2.');
                    ask();
                }
            });
        };
        ask();
    });
}

// Interactive CLI Device Selection
async function selectDevice() {
    return new Promise((resolve) => {
        console.log('Scanning audio devices...');
        exec(`"${ffmpegPath}" -list_devices true -f dshow -i dummy`, async (error, stdout, stderr) => {
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

            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            const ask = () => {
                console.log('\n=== Available Audio Devices ===');
                devices.forEach((d, i) => console.log(`${i + 1}. ${d}`));
                console.log('===============================');

                rl.question('\nEnter number to select device: ', (answer) => {
                    const index = parseInt(answer) - 1;
                    if (!isNaN(index) && index >= 0 && index < devices.length) {
                        selectedAudioDevice = `audio=${devices[index]}`;
                        console.log(`\nSelected: "${devices[index]}"`);
                        rl.close();
                        resolve();
                    } else {
                        console.log('\n[Error] Invalid selection. Please try again.');
                        ask();
                    }
                });
            };

            ask();
        });
    });
}

// Interactive CLI App Selection
async function selectApp() {
    return new Promise((resolve, reject) => {
        console.log('Scanning audio sessions...');

        const proc = spawn(audioCaptureExe, ['--list']);
        let output = '';

        proc.stdout.on('data', (data) => {
            output += data.toString();
        });

        proc.stderr.on('data', (data) => {
            console.error(`[AudioCapture] ${data.toString().trim()}`);
        });

        proc.on('error', (err) => {
            console.error(`Failed to run AudioCapture.exe: ${err.message}`);
            console.error('Make sure to build the AudioCapture project:');
            console.error('  cd AudioCapture && dotnet build -c Release');
            reject(err);
        });

        proc.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`AudioCapture exited with code ${code}`));
                return;
            }

            try {
                const apps = JSON.parse(output);

                if (apps.length === 0) {
                    console.log('\nNo applications with audio sessions found.');
                    console.log('Play some audio in an app and try again.');
                    process.exit(1);
                }

                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });

                const ask = () => {
                    console.log('\n=== Applications with Audio Sessions ===');
                    apps.forEach((app, i) => {
                        const status = app.isActive ? '🔊' : '🔇';
                        console.log(`${i + 1}. ${status} ${app.processName} (PID: ${app.processId}) - ${app.windowTitle}`);
                    });
                    console.log('=========================================');
                    console.log('🔊 = Currently playing audio | 🔇 = Has audio session but not playing');

                    rl.question('\nEnter number to select app: ', (answer) => {
                        const index = parseInt(answer) - 1;
                        if (!isNaN(index) && index >= 0 && index < apps.length) {
                            selectedAppPid = apps[index].processId;
                            console.log(`\nSelected: "${apps[index].processName}" (PID: ${selectedAppPid})`);
                            rl.close();
                            resolve();
                        } else {
                            console.log('\n[Error] Invalid selection. Please try again.');
                            ask();
                        }
                    });
                };

                ask();
            } catch (e) {
                reject(new Error(`Failed to parse audio sessions: ${e.message}`));
            }
        });
    });
}

// Check if FFmpeg is installed
function checkFFmpeg() {
    return new Promise((resolve, reject) => {
        exec(`"${ffmpegPath}" -version`, (error, stdout, stderr) => {
            if (error) {
                console.error('FFmpeg is not installed or not found in system PATH.');
                console.error('Please install FFmpeg and try again.');
                process.exit(1);
            }
            resolve();
        });
    });
}

// Main Start Sequence
(async () => {
    await checkFFmpeg();
    await selectCaptureMode();

    if (captureMode === 'device') {
        await selectDevice();
    } else {
        await selectApp();
    }

    console.log('Starting Bot...');

    client.once(Events.ClientReady, c => {
        console.log(`Ready! Logged in as ${c.user.tag}`);
        console.log(`Mode: ${captureMode === 'device' ? 'Device' : 'App'}`);
        if (captureMode === 'device') {
            console.log(`Device: ${selectedAudioDevice}`);
        } else {
            console.log(`App PID: ${selectedAppPid}`);
        }
    });

    client.login(process.env.DISCORD_TOKEN);
})();

client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

    if (message.content === '!join') {
        const channel = message.member?.voice.channel;
        if (!channel) return message.reply('Join a voice channel first!');

        const connection = streamManager.join(channel);

        connection.on(VoiceConnectionStatus.Ready, () => {
            console.log('Voice Connection Ready');
            message.reply(`Joined! Streaming ${captureMode === 'device' ? 'device audio' : 'app audio'}...`);

            if (captureMode === 'device') {
                streamManager.startStreaming(selectedAudioDevice);
            } else {
                streamManager.startAppStreaming(selectedAppPid);
            }
        });
    }

    if (message.content === '!stop') {
        streamManager.disconnect();
        message.reply('Stopped.');
    }
});