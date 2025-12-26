using System;
using System.Runtime.InteropServices;
using System.Threading;

namespace AudioCapture;

/// <summary>
/// Native Windows API declarations for per-process audio loopback capture.
/// Requires Windows 10 build 20348 or later.
/// </summary>
public static class ProcessLoopbackNative
{
    // Virtual audio device for process loopback
    public const string VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK = "VAD\\Process_Loopback";
    
    public static readonly Guid IID_IAudioClient = new Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2");

    // Enums
    public enum AUDIOCLIENT_ACTIVATION_TYPE : int
    {
        AUDIOCLIENT_ACTIVATION_TYPE_DEFAULT = 0,
        AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK = 1
    }

    public enum PROCESS_LOOPBACK_MODE : int
    {
        PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE = 0,
        PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE = 1
    }

    // Structures - must match native layout exactly
    [StructLayout(LayoutKind.Sequential)]
    public struct AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS
    {
        public uint TargetProcessId;
        public PROCESS_LOOPBACK_MODE ProcessLoopbackMode;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct AUDIOCLIENT_ACTIVATION_PARAMS
    {
        public AUDIOCLIENT_ACTIVATION_TYPE ActivationType;
        public AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS ProcessLoopbackParams;
    }

    // PROPVARIANT structure for passing activation params
    [StructLayout(LayoutKind.Sequential)]
    public struct PROPVARIANT
    {
        public ushort vt;          // VT_BLOB = 0x41 (65)
        public ushort wReserved1;
        public ushort wReserved2;
        public ushort wReserved3;
        public uint cbSize;        // Size of blob data
        public IntPtr pBlobData;   // Pointer to blob data
        
        // Padding for 64-bit alignment
        private IntPtr _padding;
    }

    // ActivateAudioInterfaceAsync function
    [DllImport("Mmdevapi.dll", ExactSpelling = true, PreserveSig = false)]
    public static extern void ActivateAudioInterfaceAsync(
        [MarshalAs(UnmanagedType.LPWStr)] string deviceInterfacePath,
        [MarshalAs(UnmanagedType.LPStruct)] Guid riid,
        IntPtr activationParams,
        IActivateAudioInterfaceCompletionHandler completionHandler,
        out IActivateAudioInterfaceAsyncOperation activationOperation);

    // COM Interfaces
    [ComImport]
    [Guid("41D949AB-9862-444A-80F6-C261334DA5EB")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IActivateAudioInterfaceCompletionHandler
    {
        void ActivateCompleted(IActivateAudioInterfaceAsyncOperation activateOperation);
    }

    [ComImport]
    [Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IActivateAudioInterfaceAsyncOperation
    {
        void GetActivateResult(out int activateResult, [MarshalAs(UnmanagedType.IUnknown)] out object activatedInterface);
    }
    
    /// <summary>
    /// Creates a PROPVARIANT blob containing the activation params and returns pointers
    /// to both the PROPVARIANT and the blob data (both need to be freed later).
    /// </summary>
    public static IntPtr CreateActivationParamsPropVariant(uint processId, PROCESS_LOOPBACK_MODE mode)
    {
        // Create the activation params structure
        var activationParams = new AUDIOCLIENT_ACTIVATION_PARAMS
        {
            ActivationType = AUDIOCLIENT_ACTIVATION_TYPE.AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK,
            ProcessLoopbackParams = new AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS
            {
                TargetProcessId = processId,
                ProcessLoopbackMode = mode
            }
        };

        // Serialize the activation params to a blob
        int structSize = Marshal.SizeOf<AUDIOCLIENT_ACTIVATION_PARAMS>();
        IntPtr blobPtr = Marshal.AllocCoTaskMem(structSize);
        Marshal.StructureToPtr(activationParams, blobPtr, false);

        // Create the PROPVARIANT
        var propVariant = new PROPVARIANT
        {
            vt = 0x41, // VT_BLOB
            wReserved1 = 0,
            wReserved2 = 0,
            wReserved3 = 0,
            cbSize = (uint)structSize,
            pBlobData = blobPtr
        };

        // Allocate and copy the PROPVARIANT
        int propVariantSize = Marshal.SizeOf<PROPVARIANT>();
        IntPtr propVariantPtr = Marshal.AllocCoTaskMem(propVariantSize);
        Marshal.StructureToPtr(propVariant, propVariantPtr, false);

        return propVariantPtr;
    }

    public static void FreePropVariant(IntPtr propVariantPtr)
    {
        if (propVariantPtr != IntPtr.Zero)
        {
            var propVariant = Marshal.PtrToStructure<PROPVARIANT>(propVariantPtr);
            if (propVariant.pBlobData != IntPtr.Zero)
            {
                Marshal.FreeCoTaskMem(propVariant.pBlobData);
            }
            Marshal.FreeCoTaskMem(propVariantPtr);
        }
    }
}

/// <summary>
/// Completion handler for async audio interface activation.
/// </summary>
public class ActivateAudioInterfaceCompletionHandler : ProcessLoopbackNative.IActivateAudioInterfaceCompletionHandler
{
    private readonly ManualResetEvent _completionEvent = new ManualResetEvent(false);
    private object? _audioClient;
    private int _activateResult;

    public void ActivateCompleted(ProcessLoopbackNative.IActivateAudioInterfaceAsyncOperation activateOperation)
    {
        try
        {
            activateOperation.GetActivateResult(out _activateResult, out _audioClient);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ActivateCompleted] Error: {ex.Message}");
            _activateResult = unchecked((int)0x80004005); // E_FAIL
        }
        finally
        {
            _completionEvent.Set();
        }
    }

    public bool WaitForCompletion(int timeout = 5000)
    {
        return _completionEvent.WaitOne(timeout);
    }

    public object? GetAudioClient() => _audioClient;
    public int GetActivateResult() => _activateResult;
}
