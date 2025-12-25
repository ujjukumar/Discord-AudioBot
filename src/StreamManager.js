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
        // Implementation in next task
    }

    /**
     * Stops the current stream.
     */
    stopStreaming() {
        // Implementation in next task
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