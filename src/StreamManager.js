const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus
} = require('@discordjs/voice');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class StreamManager {
    constructor() {
        this.connection = null;
        this.player = null;
        this.subscription = null;
        this.ffmpegProcess = null;
        this.audioCaptureProcess = null;
        this.ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
        
        // Define path to the C# Capture helper
        // TODO: Move this to a config file
        this.audioCaptureExe = path.join(__dirname, '..', 'AudioCapture', 'bin', 'Release', 'net10.0', 'AudioCapture.exe');
        
        if (!fs.existsSync(this.audioCaptureExe)) {
            console.warn('[StreamManager] Warning: AudioCapture.exe not found at:', this.audioCaptureExe);
            console.warn('[StreamManager] App capture mode will not work until you build the C# project.');
        }
    }

    /**
     * Joins a voice channel.
     * @param {VoiceChannel} channel 
     * @returns {VoiceConnection}
     */
    join(channel) {
        this.disconnect(); // Clean up existing connection if any

        this.connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: true
        });

        return this.connection;
    }

    /**
     * Starts streaming audio from a device (original mode).
     * Uses FFmpeg with dshow.
     * @param {string} selectedAudioDevice 
     */
    startStreaming(selectedAudioDevice) {
        this.stopStreaming();

        this.player = createAudioPlayer();

        console.log(`[FFmpeg] Starting capture on: ${selectedAudioDevice}`);

        const args = [
            '-f', 'dshow',
            '-i', selectedAudioDevice,
            '-ac', '2',
            '-ar', '48000',
            '-f', 's16le',
            'pipe:1'
        ];

        this.ffmpegProcess = spawn(this.ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

        this.ffmpegProcess.stderr.on('data', d => {
            const msg = d.toString();
            // Only log errors or device opens, filter frame progress
            if (!msg.includes('size=') && !msg.includes('frame=')) {
                console.log(`[FFmpeg] ${msg.trim()}`);
            }
        });

        this.ffmpegProcess.on('close', (code) => {
            if (code !== 0 && code !== null) {
                console.error(`[FFmpeg] Process exited unexpectedly with code ${code}`);
            } else {
                console.log('[FFmpeg] Process stopped.');
            }
        });

        const resource = createAudioResource(this.ffmpegProcess.stdout, { inputType: 'raw' });
        this.player.play(resource);

        if (this.connection) {
            this.subscription = this.connection.subscribe(this.player);
        }

        this.player.on(AudioPlayerStatus.Playing, () => console.log('Audio is streaming.'));
        this.player.on('error', error => console.error('Player Error:', error.message));
    }

    /**
     * Starts streaming audio from a specific application (app mode).
     * Uses the C# AudioCapture helper.
     * @param {number} processId - The process ID to capture audio from
     */
    startAppStreaming(processId) {
        this.stopStreaming();

        this.player = createAudioPlayer();

        console.log(`[AudioCapture] Starting capture for PID: ${processId}`);

        const args = ['--capture', processId.toString()];

        this.audioCaptureProcess = spawn(this.audioCaptureExe, args, { stdio: ['ignore', 'pipe', 'pipe'] });

        this.audioCaptureProcess.stderr.on('data', d => {
            const msg = d.toString();
            console.log(`[AudioCapture] ${msg.trim()}`);
        });

        this.audioCaptureProcess.on('error', (err) => {
            console.error(`[AudioCapture] Failed to start: ${err.message}`);
            console.error('[AudioCapture] Make sure to build the AudioCapture project first:');
            console.error('  cd AudioCapture && dotnet build -c Release');
        });

        this.audioCaptureProcess.on('close', (code) => {
            if (code !== 0 && code !== null) {
                console.error(`[AudioCapture] Process exited unexpectedly with code ${code}`);
                // Optional: You could emit an event here to notify the bot to tell the user
            } else {
                console.log('[AudioCapture] Process stopped.');
            }
        });

        // The C# helper outputs raw 48kHz/16-bit/stereo PCM directly
        const resource = createAudioResource(this.audioCaptureProcess.stdout, { inputType: 'raw' });
        this.player.play(resource);

        if (this.connection) {
            this.subscription = this.connection.subscribe(this.player);
        }

        this.player.on(AudioPlayerStatus.Playing, () => console.log('App audio is streaming.'));
        this.player.on('error', error => console.error('Player Error:', error.message));
    }

    /**
     * Toggles the pause state of the player.
     * @returns {string} 'playing', 'paused', or 'stopped'
     */
    togglePause() {
        if (!this.player) return 'stopped';

        if (this.player.state.status === AudioPlayerStatus.Playing) {
            this.player.pause();
            return 'paused';
        } else if (this.player.state.status === AudioPlayerStatus.Paused) {
            this.player.unpause();
            return 'playing';
        }
        
        return 'stopped';
    }

    /**
     * Stops the current stream.
     */
    stopStreaming() {
        if (this.subscription) {
            this.subscription.unsubscribe();
            this.subscription = null;
        }
        if (this.ffmpegProcess) {
            this.ffmpegProcess.kill();
            this.ffmpegProcess = null;
        }
        if (this.audioCaptureProcess) {
            this.audioCaptureProcess.kill();
            this.audioCaptureProcess = null;
        }
        if (this.player) {
            this.player.stop();
            this.player = null;
        }
    }

    /**
     * Disconnects from the voice channel.
     */
    disconnect() {
        this.stopStreaming();
        if (this.connection) {
            this.connection.destroy();
            this.connection = null;
        }
    }
}

module.exports = StreamManager;
