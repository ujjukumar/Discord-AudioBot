const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    VoiceConnectionStatus 
} = require('@discordjs/voice');
const { spawn } = require('child_process');

class StreamManager {
    constructor() {
        this.connection = null;
        this.player = null;
        this.ffmpegProcess = null;
        this.ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
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
            selfDeaf: false
        });

        return this.connection;
    }

    /**
     * Starts streaming audio from a device.
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

        const resource = createAudioResource(this.ffmpegProcess.stdout, { inputType: 'raw' });
        this.player.play(resource);
        
        if (this.connection) {
            this.connection.subscribe(this.player);
        }

        this.player.on(AudioPlayerStatus.Playing, () => console.log('Audio is streaming.'));
        this.player.on('error', error => console.error('Player Error:', error.message));
    }

    /**
     * Stops the current stream.
     */
    stopStreaming() {
        if (this.ffmpegProcess) {
            this.ffmpegProcess.kill();
            this.ffmpegProcess = null;
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
