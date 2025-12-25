# Track Specification: Refactor Stream Manager & Improve CLI

## Overview
This track focuses on improving the code quality and robustness of the AudioBot. The primary goal is to decouple the audio streaming logic from the main `index.js` file by creating a dedicated `StreamManager` class. Additionally, the CLI interaction will be enhanced to handle invalid inputs gracefully.

## Goals
1.  **Modularity:** Separate streaming logic into `src/StreamManager.js`.
2.  **Robustness:** Improve error handling in the CLI device selection loop.
3.  **Maintainability:** Clean up `index.js` to act as a lightweight entry point.

## Requirements

### 1. StreamManager Class
-   **Location:** `src/StreamManager.js`
-   **Responsibilities:**
    -   Manage the Discord Voice Connection (`joinVoiceChannel`).
    -   Manage the Audio Player (`createAudioPlayer`).
    -   Manage the FFmpeg child process (`spawn`).
    -   Handle events (Voice connection ready, Player error, FFmpeg stderr).
-   **Methods:**
    -   `join(channel)`: Joins a voice channel.
    -   `startStreaming(device)`: Starts the FFmpeg process and plays audio.
    -   `stopStreaming()`: Kills FFmpeg and stops the player.
    -   `disconnect()`: Destroys the voice connection.

### 2. CLI Improvements
-   **Device Selection:**
    -   If the user enters an invalid number, log an error message and prompt again (loop until valid).
    -   Do not exit the process on invalid input.

### 3. Refactored Entry Point
-   `index.js` should instantiate `StreamManager` and handle Discord client events (`!join`, `!stop`) by delegating to the manager instance.

## Technical Details
-   **FFmpeg Path:** Continue using the system-installed `ffmpeg` but allow override via `process.env.FFMPEG_PATH`.
-   **Error Handling:** Ensure that `StreamManager` emits or logs errors appropriately without crashing the bot.

## Future Considerations
-   This refactor paves the way for adding more commands (e.g., volume control) to the `StreamManager` later.
