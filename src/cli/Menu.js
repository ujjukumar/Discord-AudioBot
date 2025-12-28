const inquirer = require('inquirer');
const chalk = require('chalk');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuration constants
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
const AUDIO_CAPTURE_EXE = path.join(__dirname, '..', '..', 'AudioCapture', 'bin', 'Release', 'net10.0', 'AudioCapture.exe');

const Menu = {
    /**
     * Entry point for the interactive CLI
     */
    async run() {
        console.log(chalk.cyan.bold('\n🎛️  AudioBot Configuration Wizard\n'));

        await this.checkDependencies();

        const { mode } = await inquirer.prompt([
            {
                type: 'list',
                name: 'mode',
                message: 'Select Capture Mode:',
                choices: [
                    { name: '🔊 Device Mode (Stereo Mix, Mic, etc.)', value: 'device' },
                    { name: '🖥️  App Mode (Specific Application)', value: 'app' }
                ]
            }
        ]);

        let config = { mode };

        if (mode === 'device') {
            config.device = await this.selectDevice();
        } else {
            config.pid = await this.selectApp();
        }

        const { timeout } = await inquirer.prompt([
            {
                type: 'number',
                name: 'timeout',
                message: 'Auto-disconnect timeout when alone (minutes):',
                default: 5,
                validate: (value) => value > 0 ? true : 'Please enter a positive number.'
            }
        ]);
        config.autoDisconnectTimeout = timeout;

        console.log(chalk.green('\n✅ Configuration Complete! Starting Bot...\n'));
        return config;
    },

    /**
     * Checks if necessary dependencies (FFmpeg, AudioCapture) are available.
     */
    async checkDependencies() {
        // Check FFmpeg
        await new Promise((resolve) => {
            exec(`"${FFMPEG_PATH}" -version`, (error) => {
                if (error) {
                    console.error(chalk.red('❌ FFmpeg is not installed or not found in system PATH.'));
                    console.error(chalk.yellow('Please install FFmpeg and try again.'));
                    process.exit(1);
                }
                resolve();
            });
        });

        // Check AudioCapture.exe if needed (though we check it during app selection too)
        // We'll just warn if it's missing for now, as it might be needed for App mode.
    },

    /**
     * Lists and selects an audio device using FFmpeg
     */
    async selectDevice() {
        console.log(chalk.gray('Scanning audio devices...'));

        return new Promise((resolve) => {
            exec(`"${FFMPEG_PATH}" -list_devices true -f dshow -i dummy`, async (error, stdout, stderr) => {
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
                    console.error(chalk.red('❌ No audio devices found!'));
                    console.error(chalk.yellow('Hint: Enable "Stereo Mix" in Windows Sound Settings -> Recording.'));
                    process.exit(1);
                }

                const { selectedDevice } = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'selectedDevice',
                        message: 'Select Audio Device:',
                        choices: devices
                    }
                ]);

                resolve(`audio=${selectedDevice}`);
            });
        });
    },

    /**
     * Lists and selects an application using AudioCapture.exe
     */
    async selectApp() {
        console.log(chalk.gray('Scanning audio sessions...'));

        if (!fs.existsSync(AUDIO_CAPTURE_EXE)) {
            console.error(chalk.red(`❌ AudioCapture.exe not found at:\n${AUDIO_CAPTURE_EXE}`));
            console.error(chalk.yellow('👉 Build it first: cd AudioCapture && dotnet build -c Release'));
            process.exit(1);
        }

        return new Promise((resolve) => {
            const proc = spawn(AUDIO_CAPTURE_EXE, ['--list']);
            let output = '';

            proc.stdout.on('data', (data) => output += data.toString());
            
            proc.on('close', async (code) => {
                if (code !== 0) {
                    console.error(chalk.red('❌ Failed to retrieve audio sessions from AudioCapture.exe'));
                    process.exit(1);
                }

                try {
                    const apps = JSON.parse(output);

                    if (apps.length === 0) {
                        console.log(chalk.yellow('⚠️  No applications with active audio sessions found.'));
                        console.log(chalk.gray('Play some audio in an app (e.g., YouTube in Edge) and try again.'));
                        process.exit(1);
                    }

                    const choices = apps.map(app => ({
                        name: `${app.isActive ? '🔊' : '🔇'} ${app.processName} (PID: ${app.processId}) - ${app.windowTitle || 'No Title'}`,                        value: app.processId
                    }));

                    const { selectedPid } = await inquirer.prompt([
                        {
                            type: 'list',
                            name: 'selectedPid',
                            message: 'Select Application to Stream:',
                            choices: choices,
                            pageSize: 10
                        }
                    ]);

                    resolve(selectedPid);

                } catch (e) {
                    console.error(chalk.red('❌ Error parsing app list:'), e.message);
                    process.exit(1);
                }
            });
        });
    }
};

module.exports = Menu;
