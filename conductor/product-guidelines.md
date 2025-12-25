# Product Guidelines

## Communication Tone
- **Standard Mode:** Functional and Direct. Focus on clear, concise status updates (e.g., "Connected", "Streaming Started").
- **Debug Mode:** Technical and Verbose. Expose detailed FFmpeg parameters, process states, and internal logs for troubleshooting.

## User Experience (CLI)
- **Interactive & Guided:** Prioritize a guided CLI flow that prompts users for necessary inputs (like device selection) to reduce configuration errors and improve accessibility.

## Dependency Management
- **Flexible & Verified:** Leverage the host system's global tools (e.g., system-installed `ffmpeg`) but strictly validate their existence and version compatibility before execution to prevent runtime failures.

## Code Quality Priorities
- **Performance-Driven:** Focus on low-overhead logic and efficient resource usage to ensure audio streaming remains stutter-free.
- **Modularity:** Structure the application to allow for easy addition or removal of features without coupling them tightly to the core streaming engine.

## Development Workflow
- **Incremental & Stable:** Introduce features one at a time, ensuring complete stability before integration.
- **Modular Architecture:** Build with separation of concerns in mind to facilitate future extensibility.
