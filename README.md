# AudioBot

A simple Discord bot that streams system audio or **specific application audio** to a voice channel.

## Prerequisites

1.  **Node.js**: Installed on your system.
2.  **FFmpeg**: Installed and added to your system PATH.
    *   To verify, run `ffmpeg -version` in your terminal.
3.  **.NET 10.0 SDK** (for per-app audio capture): Required for "App Mode".
    *   To verify, run `dotnet --version` in your terminal.
4.  **Windows 10 build 20348+**: Required for per-process audio capture.

## Setup

1.  Clone the repository and navigate to the folder.
2.  Install Node.js dependencies:
    ```bash
    npm install
    ```
3.  Build the AudioCapture helper (for App Mode):
    ```bash
    cd AudioCapture
    dotnet build -c Release
    cd ..
    ```
4.  Create a `.env` file in the project root:
    ```env
    DISCORD_TOKEN=your_bot_token_here
    ```

## Usage

1.  Start the bot:
    ```bash
    node index.js
    ```

2.  **Select Capture Mode**:
    - **Device Mode**: Capture from audio devices (Stereo Mix, Microphone, etc.)
    - **App Mode**: Capture audio from a specific application

3.  In Discord:
    *   Join a voice channel.
    *   Type `!join` to summon the bot.
    *   Type `!stop` to stop streaming and leave.

## Capture Modes

### Device Mode (Original)
Captures audio from a Windows audio device like Stereo Mix.

**To enable Stereo Mix:**
*   Go to **Sound Settings** -> **Sound Control Panel**.
*   Click the **Recording** tab.
*   Right-click and ensure "Show Disabled Devices" is checked.
*   Right-click **Stereo Mix** and enable it.

### App Mode (New)
Captures audio from a **specific application** without affecting other system audio.

The bot will show a list of all applications currently with audio sessions:
```
=== Applications with Audio Sessions ===
1. 🔊 msedge (PID: 1234) - YouTube - Microsoft Edge
2. 🔇 Spotify (PID: 5678) - Spotify Free
3. 🔊 Discord (PID: 9012) - Discord
=========================================
```

Select the app you want to stream, and only that app's audio will be sent to Discord!

## Troubleshooting

*   **No devices found?** Ensure your microphone or Stereo Mix is enabled in Windows settings.
*   **Bot joins but no sound?** Check if the correct input device/app was selected.
*   **AudioCapture.exe not found?** Build it first: `cd AudioCapture && dotnet build -c Release`
*   **App Mode not working?** Ensure you have Windows 10 build 20348 or later.
