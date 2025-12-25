# AudioBot

A simple Discord bot that streams system audio (via Stereo Mix or other inputs) to a voice channel.

## Prerequisites

1.  **Node.js**: Installed on your system.
2.  **FFmpeg**: Installed and added to your system PATH.
    *   To verify, run `ffmpeg -version` in your terminal.
3.  **Windows**: This bot currently uses `dshow` which is specific to Windows.

## Setup

1.  Clone the repository and navigate to the folder.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Create a `.env` file in the project root:
    ```env
    DISCORD_TOKEN=your_bot_token_here
    ```
4.  **Enable Stereo Mix** (if you want to stream desktop audio):
    *   Go to **Sound Settings** -> **Sound Control Panel**.
    *   Click the **Recording** tab.
    *   Right-click and ensure "Show Disabled Devices" is checked.
    *   Right-click **Stereo Mix** and enable it.

## Usage

1.  Start the bot:
    ```bash
    node index.js
    ```
2.  Select the audio input device from the interactive list.
3.  In Discord:
    *   Join a voice channel.
    *   Type `!join` to summon the bot.
    *   Type `!stop` to stop streaming and leave.

## Troubleshooting

*   **No devices found?** Ensure your microphone or Stereo Mix is enabled in Windows settings.
*   **Bot joins but no sound?** Check if the correct input device was selected.
