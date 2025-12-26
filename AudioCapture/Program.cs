using System.Text.Json;
using AudioCapture;

// Handle Ctrl+C gracefully
var cts = new CancellationTokenSource();
Console.CancelKeyPress += (s, e) =>
{
    e.Cancel = true;
    cts.Cancel();
};

if (args.Length == 0)
{
    ShowHelp();
    return 1;
}

switch (args[0].ToLower())
{
    case "--list":
    case "-l":
        return ListAudioProcesses();
    
    case "--capture":
    case "-c":
        if (args.Length < 2 || !int.TryParse(args[1], out int pid))
        {
            Console.Error.WriteLine("Error: --capture requires a valid process ID");
            return 1;
        }
        return await CaptureProcess(pid, cts.Token);
    
    case "--help":
    case "-h":
        ShowHelp();
        return 0;
    
    default:
        Console.Error.WriteLine($"Unknown option: {args[0]}");
        ShowHelp();
        return 1;
}

void ShowHelp()
{
    Console.Error.WriteLine("AudioCapture - Per-process audio capture utility");
    Console.Error.WriteLine();
    Console.Error.WriteLine("Usage:");
    Console.Error.WriteLine("  AudioCapture --list              List all processes with audio sessions");
    Console.Error.WriteLine("  AudioCapture --capture <PID>     Capture audio from a specific process");
    Console.Error.WriteLine();
    Console.Error.WriteLine("Options:");
    Console.Error.WriteLine("  -l, --list      List audio processes (outputs JSON to stdout)");
    Console.Error.WriteLine("  -c, --capture   Capture audio (outputs raw PCM to stdout)");
    Console.Error.WriteLine("  -h, --help      Show this help message");
    Console.Error.WriteLine();
    Console.Error.WriteLine("Output format for --capture: 48kHz, 16-bit, stereo, little-endian PCM");
}

int ListAudioProcesses()
{
    try
    {
        var processes = AudioSessionManager.GetAudioProcesses();
        var json = JsonSerializer.Serialize(processes, new JsonSerializerOptions 
        { 
            WriteIndented = false,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        });
        Console.WriteLine(json);
        return 0;
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Error listing audio processes: {ex.Message}");
        return 1;
    }
}

async Task<int> CaptureProcess(int processId, CancellationToken cancellationToken)
{
    // Verify the process exists and has an audio session
    var processes = AudioSessionManager.GetAudioProcesses();
    var target = processes.FirstOrDefault(p => p.ProcessId == processId);
    
    if (target == null)
    {
        Console.Error.WriteLine($"Error: Process {processId} not found in audio sessions.");
        Console.Error.WriteLine("Use --list to see available processes.");
        return 1;
    }
    
    Console.Error.WriteLine($"[AudioCapture] Capturing audio from: {target.ProcessName} (PID: {processId})");
    Console.Error.WriteLine($"[AudioCapture] Window: {target.WindowTitle}");
    Console.Error.WriteLine($"[AudioCapture] Press Ctrl+C to stop");
    
    try
    {
        // Output raw PCM to stdout
        using var stdout = Console.OpenStandardOutput();
        using var capture = new ProcessAudioCapture(processId, stdout);
        
        capture.StartCapture();
        
        // Wait until cancelled
        try
        {
            await Task.Delay(Timeout.Infinite, cancellationToken);
        }
        catch (OperationCanceledException)
        {
            // Expected when Ctrl+C is pressed
        }
        
        capture.StopCapture();
        Console.Error.WriteLine("[AudioCapture] Capture stopped gracefully");
        return 0;
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Error during capture: {ex.Message}");
        return 1;
    }
}
