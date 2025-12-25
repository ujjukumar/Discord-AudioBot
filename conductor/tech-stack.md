# Technology Stack

## Core Runtime
- **Node.js:** The primary execution environment for the bot.

## Discord Integration
- **discord.js (v14+):** The main library for communicating with the Discord API.
- **@discordjs/voice:** Handles all voice channel connections, audio players, and resource management.
- **@snazzah/davey:** Implementation of Discord's DAVE protocol for end-to-end encryption.

## Audio Processing & Encoding
- **FFmpeg (System Installed):** Utilized via `child_process` to capture system audio (using `dshow` on Windows) and pipe it into the Discord stream.
- **libsodium-wrappers:** Provides necessary cryptographic primitives for voice data.
- **opusscript:** Handles audio encoding into the Opus format required by Discord.

## Environment & Configuration
- **dotenv:** Loads environment variables (like the Discord Token) from the local `.env` file.

## Infrastructure & Host OS
- **Windows OS:** The current implementation is optimized for Windows, using the DirectShow (`dshow`) framework for audio device discovery and capture.
