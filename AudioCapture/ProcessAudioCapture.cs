using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace AudioCapture;

/// <summary>
/// Captures audio from a specific process using Windows Process Loopback API.
/// This captures ONLY the audio from the specified process, not all system audio.
/// Requires Windows 10 build 20348 or later.
/// </summary>
public class ProcessAudioCapture : IDisposable
{
    private readonly int _targetProcessId;
    private readonly Stream _outputStream;
    private bool _isCapturing;
    private Thread? _captureThread;
    private WaveFormat? _captureFormat;
    private WasapiLoopbackCapture? _fallbackCapture;
    
    // COM objects for per-process capture
    private IAudioClientNative? _audioClient;
    private IAudioCaptureClientNative? _captureClient;
    // Loopback stream flag constant
    private const int AUDCLNT_STREAMFLAGS_LOOPBACK = 0x00020000;
    private const int AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM = unchecked((int)0x80000000);

    // Target output format: 48kHz, 16-bit, stereo (Discord compatible)
    private readonly WaveFormat _targetFormat = new WaveFormat(48000, 16, 2);

    public ProcessAudioCapture(int processId, Stream outputStream)
    {
        _targetProcessId = processId;
        _outputStream = outputStream;
    }

    /// <summary>
    /// Starts capturing audio from the target process only.
    /// </summary>
    public void StartCapture()
    {
        Console.Error.WriteLine($"[AudioCapture] Starting TRUE per-process capture for PID: {_targetProcessId}");
        
        try
        {
            // First, try to use the per-process capture API
            if (TryActivateProcessLoopback())
            {
                Console.Error.WriteLine("[AudioCapture] Successfully activated per-process loopback!");
                _isCapturing = true;
                _captureThread = new Thread(CaptureLoop) { IsBackground = true };
                _captureThread.Start();
            }
            else
            {
                // Fallback: Use the device-based approach but warn user
                Console.Error.WriteLine("[AudioCapture] WARNING: Per-process API failed, falling back to standard loopback");
                Console.Error.WriteLine("[AudioCapture] This will capture ALL system audio, not just the selected app!");
                StartFallbackCapture();
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[AudioCapture] Error starting capture: {ex.Message}");
            Console.Error.WriteLine("[AudioCapture] Falling back to standard loopback...");
            StartFallbackCapture();
        }
    }

    private IntPtr _activationParamsPtr;

    private bool TryActivateProcessLoopback()
    {
        try
        {
            // Create PROPVARIANT with activation params as VT_BLOB
            _activationParamsPtr = ProcessLoopbackNative.CreateActivationParamsPropVariant(
                (uint)_targetProcessId,
                ProcessLoopbackNative.PROCESS_LOOPBACK_MODE.PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE);
            
            var handler = new ActivateAudioInterfaceCompletionHandler();
            
            Console.Error.WriteLine($"[AudioCapture] Calling ActivateAudioInterfaceAsync...");
            Console.Error.WriteLine($"[AudioCapture] Device: {ProcessLoopbackNative.VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK}");
            Console.Error.WriteLine($"[AudioCapture] Target PID: {_targetProcessId}");
            
            ProcessLoopbackNative.ActivateAudioInterfaceAsync(
                ProcessLoopbackNative.VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
                ProcessLoopbackNative.IID_IAudioClient,
                _activationParamsPtr,
                handler,
                out var operation);

            Console.Error.WriteLine("[AudioCapture] Waiting for activation...");
            
            if (!handler.WaitForCompletion(10000))
            {
                Console.Error.WriteLine("[AudioCapture] Timeout waiting for audio interface activation");
                return false;
            }

            int hr = handler.GetActivateResult();
            Console.Error.WriteLine($"[AudioCapture] Activation result HRESULT: 0x{hr:X8}");
            
            if (hr < 0)
            {
                Console.Error.WriteLine($"[AudioCapture] Activation failed with HRESULT: 0x{hr:X8}");
                return false;
            }

            var audioClientObj = handler.GetAudioClient();
            if (audioClientObj == null)
            {
                Console.Error.WriteLine("[AudioCapture] AudioClient is null");
                return false;
            }

            _audioClient = audioClientObj as IAudioClientNative;
            if (_audioClient == null)
            {
                Console.Error.WriteLine("[AudioCapture] Failed to cast to IAudioClient");
                return false;
            }

            Console.Error.WriteLine("[AudioCapture] AudioClient obtained, initializing...");
            
            // Initialize the audio client for capture
            InitializeAudioClient();
            return true;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[AudioCapture] Per-process activation error: {ex.GetType().Name}: {ex.Message}");
            return false;
        }
    }

    private void InitializeAudioClient()
    {
        IntPtr mixFormatPtr = IntPtr.Zero;
        bool formatAllocated = false;
        
        try
        {
            try 
            {
                // 1. Try Get Mix Format
                int hr = _audioClient!.GetMixFormat(out mixFormatPtr);
                if (hr >= 0 && mixFormatPtr != IntPtr.Zero)
                {
                    _captureFormat = WaveFormat.MarshalFromPtr(mixFormatPtr);
                    Console.Error.WriteLine($"[AudioCapture] Capture format from device: {_captureFormat}");
                }
                else
                {
                    throw new COMException("GetMixFormat returned failure", hr);
                }
            }
            catch
            {
                // Fallback if GetMixFormat is not implemented
                _captureFormat = WaveFormat.CreateIeeeFloatWaveFormat(48000, 2);
                mixFormatPtr = WaveFormatToPtr(_captureFormat);
                formatAllocated = true;
                Console.Error.WriteLine($"[AudioCapture] Using fallback format: {_captureFormat}");
            }

            // 2. Initialize with LOOPBACK flag
            // Try duration 0 for "minimum possible" or "default"
            long bufferDuration = 0; 
            
            // Using 0x00020000 (LOOPBACK)
            int hrInit = _audioClient!.Initialize(
                0, // AUDCLNT_SHAREMODE_SHARED
                AUDCLNT_STREAMFLAGS_LOOPBACK, 
                bufferDuration,
                0,
                mixFormatPtr,
                IntPtr.Zero);
            
            if (hrInit < 0)
            {
                throw new COMException($"Initialize failed with HRESULT 0x{hrInit:X8}", hrInit);
            }

            // Get the capture client
            var captureClientGuid = new Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"); // IID_IAudioCaptureClient
            hrInit = _audioClient.GetService(ref captureClientGuid, out var captureClientObj);
            if (hrInit < 0)
            {
                throw new COMException($"GetService failed with HRESULT 0x{hrInit:X8}", hrInit);
            }
            
            _captureClient = captureClientObj as IAudioCaptureClientNative;
            Console.Error.WriteLine("[AudioCapture] Capture client obtained");

            // Start capturing
            _audioClient.Start();
            Console.Error.WriteLine("[AudioCapture] Audio client started!");
        }
        finally
        {
            if (formatAllocated && mixFormatPtr != IntPtr.Zero)
            {
                Marshal.FreeCoTaskMem(mixFormatPtr);
            }
        }
    }

    private static IntPtr WaveFormatToPtr(WaveFormat format)
    {
        // For simple WaveFormat, serialize it to unmanaged memory
        int formatSize = 18 + format.ExtraSize; // WAVEFORMATEX size
        IntPtr ptr = Marshal.AllocCoTaskMem(formatSize);
        
        // Write WAVEFORMATEX structure
        Marshal.WriteInt16(ptr, 0, (short)format.Encoding);
        Marshal.WriteInt16(ptr, 2, (short)format.Channels);
        Marshal.WriteInt32(ptr, 4, format.SampleRate);
        Marshal.WriteInt32(ptr, 8, format.AverageBytesPerSecond);
        Marshal.WriteInt16(ptr, 12, (short)format.BlockAlign);
        Marshal.WriteInt16(ptr, 14, (short)format.BitsPerSample);
        Marshal.WriteInt16(ptr, 16, (short)format.ExtraSize);
        
        return ptr;
    }

    private void CaptureLoop()
    {
        Console.Error.WriteLine("[AudioCapture] Capture loop started - capturing ONLY from target process");
        
        while (_isCapturing)
        {
            try
            {
                if (_captureClient == null) break;

                // Get the next packet size
                _captureClient.GetNextPacketSize(out var packetSize);
                
                if (packetSize == 0)
                {
                    Thread.Sleep(5); // Reduce sleep slightly
                    continue;
                }

                // Get the buffer
                _captureClient.GetBuffer(out var dataPtr, out var numFrames, out var flags, out _, out _);
                
                if (numFrames > 0 && dataPtr != IntPtr.Zero)
                {
                    int bytesPerFrame = _captureFormat!.BlockAlign;
                    int dataSize = (int)(numFrames * bytesPerFrame);
                    
                    byte[] data = new byte[dataSize];
                    Marshal.Copy(dataPtr, data, 0, dataSize);
                    
                    // Convert to target format if needed
                    if (_captureFormat != null && !_captureFormat.Equals(_targetFormat))
                    {
                        data = ConvertAudioFormat(data, dataSize, _captureFormat, _targetFormat);
                    }
                    
                    _outputStream.Write(data, 0, data.Length);
                    _outputStream.Flush();
                }
                
                _captureClient.ReleaseBuffer(numFrames);
            }
            catch (IOException)
            {
                // Output stream closed
                break;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[AudioCapture] Capture error: {ex.Message}");
                Thread.Sleep(100);
            }
        }
        
        Console.Error.WriteLine("[AudioCapture] Capture loop ended");
    }

    private void StartFallbackCapture()
    {
        // Fallback to NAudio's WasapiLoopbackCapture
        using var enumerator = new MMDeviceEnumerator();
        var device = enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
        
        _fallbackCapture = new WasapiLoopbackCapture(device);
        _captureFormat = _fallbackCapture.WaveFormat;
        
        Console.Error.WriteLine($"[AudioCapture] Fallback capture format: {_captureFormat}");
        
        _fallbackCapture.DataAvailable += (s, e) =>
        {
            if (!_isCapturing || e.BytesRecorded == 0) return;

            try
            {
                byte[] outputBuffer;
                if (_captureFormat != null && !_captureFormat.Equals(_targetFormat))
                {
                    outputBuffer = ConvertAudioFormat(e.Buffer, e.BytesRecorded, _captureFormat, _targetFormat);
                }
                else
                {
                    outputBuffer = new byte[e.BytesRecorded];
                    Array.Copy(e.Buffer, outputBuffer, e.BytesRecorded);
                }

                _outputStream.Write(outputBuffer, 0, outputBuffer.Length);
                _outputStream.Flush();
            }
            catch (IOException)
            {
                StopCapture();
            }
        };

        _fallbackCapture.RecordingStopped += (s, e) =>
        {
            if (e.Exception != null)
            {
                Console.Error.WriteLine($"[AudioCapture] Error: {e.Exception.Message}");
            }
        };

        _isCapturing = true;
        _fallbackCapture.StartRecording();
        Console.Error.WriteLine("[AudioCapture] Fallback recording started (captures ALL system audio)");
    }

    private static byte[] ConvertAudioFormat(byte[] input, int length, WaveFormat sourceFormat, WaveFormat targetFormat)
    {
        // Optimized path: IEEE Float (32-bit) -> PCM (16-bit)
        // This is the most common conversion needed for Wasapi Loopback -> Discord
        if (sourceFormat.Encoding == WaveFormatEncoding.IeeeFloat && 
            targetFormat.Encoding == WaveFormatEncoding.Pcm &&
            sourceFormat.Channels == targetFormat.Channels &&
            sourceFormat.SampleRate == targetFormat.SampleRate &&
            sourceFormat.BitsPerSample == 32 &&
            targetFormat.BitsPerSample == 16)
        {
            int sampleCount = length / 4; // 4 bytes per float
            byte[] output = new byte[sampleCount * 2]; // 2 bytes per short

            unsafe
            {
                fixed (byte* pIn = input)
                fixed (byte* pOut = output)
                {
                    float* pFloat = (float*)pIn;
                    short* pShort = (short*)pOut;

                    for (int i = 0; i < sampleCount; i++)
                    {
                        // Clamp and convert
                        float sample = pFloat[i];
                        if (sample > 1.0f) sample = 1.0f;
                        else if (sample < -1.0f) sample = -1.0f;
                        
                        pShort[i] = (short)(sample * 32767.0f);
                    }
                }
            }
            return output;
        }

        // Fallback: Use MediaFoundationResampler for complex conversions (resampling, channel mixing)
        // Note: This is expensive per-packet!
        try
        {
            using var sourceStream = new RawSourceWaveStream(new MemoryStream(input, 0, length), sourceFormat);
            using var resampler = new MediaFoundationResampler(sourceStream, targetFormat);
            resampler.ResamplerQuality = 60;
            
            var outputBuffer = new byte[length * 4]; // Oversize buffer to be safe
            int bytesRead = resampler.Read(outputBuffer, 0, outputBuffer.Length);
            
            var result = new byte[bytesRead];
            Array.Copy(outputBuffer, result, bytesRead);
            return result;
        }
        catch
        {
            // If conversion fails, return original and hope for the best
            var result = new byte[length];
            Array.Copy(input, result, length);
            return result;
        }
    }

    public void StopCapture()
    {
        _isCapturing = false;
        _audioClient?.Stop();
        _fallbackCapture?.StopRecording();
    }

    public void Dispose()
    {
        StopCapture();
        _captureThread?.Join(1000);
        
        _fallbackCapture?.Dispose();
        
        if (_activationParamsPtr != IntPtr.Zero)
        {
            ProcessLoopbackNative.FreePropVariant(_activationParamsPtr);
            _activationParamsPtr = IntPtr.Zero;
        }
        
        if (_captureClient != null)
        {
            Marshal.ReleaseComObject(_captureClient);
            _captureClient = null;
        }
        
        if (_audioClient != null)
        {
            Marshal.ReleaseComObject(_audioClient);
            _audioClient = null;
        }
    }
}

// Native COM interfaces for audio capture
[ComImport]
[Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IAudioClientNative
{
    int Initialize(int shareMode, int streamFlags, long bufferDuration, long periodicity, IntPtr format, IntPtr audioSessionGuid);
    int GetBufferSize(out uint bufferSize);
    int GetStreamLatency(out long latency);
    int GetCurrentPadding(out uint padding);
    int IsFormatSupported(int shareMode, IntPtr format, out IntPtr closestMatch);
    int GetMixFormat(out IntPtr format);
    int GetDevicePeriod(out long defaultDevicePeriod, out long minimumDevicePeriod);
    int Start();
    int Stop();
    int Reset();
    int SetEventHandle(IntPtr eventHandle);
    int GetService(ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object service);
}

[ComImport]
[Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IAudioCaptureClientNative
{
    int GetBuffer(out IntPtr data, out uint numFramesRead, out uint flags, out ulong devicePosition, out ulong qpcPosition);
    int ReleaseBuffer(uint numFramesRead);
    int GetNextPacketSize(out uint numFramesInNextPacket);
}
