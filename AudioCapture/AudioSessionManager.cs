using System.Runtime.InteropServices;
using NAudio.CoreAudioApi;
using NAudio.CoreAudioApi.Interfaces;

namespace AudioCapture;

/// <summary>
/// Manages audio session enumeration to list all processes currently playing audio.
/// </summary>
public class AudioSessionManager
{
    /// <summary>
    /// Gets all processes that currently have active audio sessions.
    /// </summary>
    public static List<AudioProcessInfo> GetAudioProcesses()
    {
        var processes = new List<AudioProcessInfo>();
        
        using var enumerator = new MMDeviceEnumerator();
        
        // Get the default audio output device
        try
        {
            using var device = enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
            var sessionManager = device.AudioSessionManager;
            var sessions = sessionManager.Sessions;
            
            for (int i = 0; i < sessions.Count; i++)
            {
                var session = sessions[i];
                try
                {
                    uint pid = session.GetProcessID;
                    if (pid == 0) continue; // Skip system sounds
                    
                    var process = System.Diagnostics.Process.GetProcessById((int)pid);
                    
                    // Check if session is active (playing audio)
                    var state = session.State;
                    
                    processes.Add(new AudioProcessInfo
                    {
                        ProcessId = (int)pid,
                        ProcessName = process.ProcessName,
                        WindowTitle = string.IsNullOrEmpty(process.MainWindowTitle) 
                            ? process.ProcessName 
                            : process.MainWindowTitle,
                        SessionState = state.ToString(),
                        IsActive = state == AudioSessionState.AudioSessionStateActive
                    });
                }
                catch (ArgumentException)
                {
                    // Process no longer exists
                }
                catch (InvalidOperationException)
                {
                    // Process has exited
                }
            }
        }
        catch (COMException)
        {
            // No audio device available
        }
        
        return processes;
    }
}

public class AudioProcessInfo
{
    public int ProcessId { get; set; }
    public string ProcessName { get; set; } = "";
    public string WindowTitle { get; set; } = "";
    public string SessionState { get; set; } = "";
    public bool IsActive { get; set; }
}
