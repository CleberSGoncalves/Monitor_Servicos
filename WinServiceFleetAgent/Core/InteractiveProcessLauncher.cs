using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;

namespace WinServiceFleetAgent.Core
{
    public static class InteractiveProcessLauncher
    {
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint WTSGetActiveConsoleSessionId();

        [DllImport("wtsapi32.dll", SetLastError = true)]
        private static extern bool WTSQueryUserToken(uint sessionId, out IntPtr phToken);

        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        private static extern bool DuplicateTokenEx(
            IntPtr hExistingToken,
            uint dwDesiredAccess,
            IntPtr lpTokenAttributes,
            int impersonationLevel,
            int tokenType,
            out IntPtr phNewToken);

        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        private static extern bool CreateProcessAsUser(
            IntPtr hToken,
            string lpApplicationName,
            string lpCommandLine,
            IntPtr lpProcessAttributes,
            IntPtr lpThreadAttributes,
            bool bInheritHandles,
            uint dwCreationFlags,
            IntPtr lpEnvironment,
            string lpCurrentDirectory,
            ref STARTUPINFO lpStartupInfo,
            out PROCESS_INFORMATION lpProcessInformation);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr hObject);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
        private struct STARTUPINFO
        {
            public int cb;
            public string lpReserved;
            public string lpDesktop;
            public string lpTitle;
            public int dwX;
            public int dwY;
            public int dwXSize;
            public int dwYSize;
            public int dwXCountChars;
            public int dwYCountChars;
            public int dwFillAttribute;
            public int dwFlags;
            public short wShowWindow;
            public short cbReserved2;
            public IntPtr lpReserved2;
            public IntPtr hStdInput;
            public IntPtr hStdOutput;
            public IntPtr hStdError;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct PROCESS_INFORMATION
        {
            public IntPtr hProcess;
            public IntPtr hThread;
            public int dwProcessId;
            public int dwThreadId;
        }

        private const uint MAXIMUM_ALLOWED = 0x02000000;
        private const uint CREATE_NEW_CONSOLE = 0x00000010;

        public static bool LaunchProcessInActiveSession(string exePath, string workingDir = null)
        {
            IntPtr hUserToken = IntPtr.Zero;
            IntPtr hPrimaryToken = IntPtr.Zero;
            try
            {
                uint activeSessionId = WTSGetActiveConsoleSessionId();
                FileLogger.Log($"[InteractiveLauncher] Tentando abrir '{exePath}' na Sessão Ativa ID {activeSessionId}...");

                if (activeSessionId != 0xFFFFFFFF && WTSQueryUserToken(activeSessionId, out hUserToken))
                {
                    if (DuplicateTokenEx(hUserToken, MAXIMUM_ALLOWED, IntPtr.Zero, 2, 1, out hPrimaryToken))
                    {
                        var si = new STARTUPINFO();
                        si.cb = Marshal.SizeOf(si);
                        si.lpDesktop = @"WinSta0\Default";

                        var pi = new PROCESS_INFORMATION();
                        string dir = string.IsNullOrWhiteSpace(workingDir) ? Path.GetDirectoryName(exePath) : workingDir;

                        bool success = CreateProcessAsUser(
                            hPrimaryToken,
                            exePath,
                            null,
                            IntPtr.Zero,
                            IntPtr.Zero,
                            false,
                            CREATE_NEW_CONSOLE,
                            IntPtr.Zero,
                            dir,
                            ref si,
                            out pi);

                        if (success)
                        {
                            FileLogger.Log($"[InteractiveLauncher] ✅ Aplicação '{exePath}' iniciada com SUCESSO na sessão interativa {activeSessionId}! (PID: {pi.dwProcessId})");
                            CloseHandle(pi.hProcess);
                            CloseHandle(pi.hThread);
                            return true;
                        }
                        else
                        {
                            int err = Marshal.GetLastWin32Error();
                            FileLogger.Log($"[InteractiveLauncher] ⚠️ CreateProcessAsUser falhou (Win32 Err: {err}). Usando fallback...");
                        }
                    }
                }
                else
                {
                    FileLogger.Log($"[InteractiveLauncher] ⚠️ Não foi possível obter token da sessão de usuário {activeSessionId}. Usando fallback...");
                }

                // Fallback: Scheduled Task or Process.Start
                return FallbackLaunch(exePath, workingDir);
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"[InteractiveLauncher] ❌ Exceção ao abrir '{exePath}'", ex);
                return FallbackLaunch(exePath, workingDir);
            }
            finally
            {
                if (hUserToken != IntPtr.Zero) CloseHandle(hUserToken);
                if (hPrimaryToken != IntPtr.Zero) CloseHandle(hPrimaryToken);
            }
        }

        private static bool FallbackLaunch(string exePath, string workingDir)
        {
            try
            {
                FileLogger.Log($"[InteractiveLauncher] Executando fallback Process.Start para '{exePath}'...");
                var dir = string.IsNullOrWhiteSpace(workingDir) ? Path.GetDirectoryName(exePath) : workingDir;
                var psi = new ProcessStartInfo
                {
                    FileName = exePath,
                    WorkingDirectory = dir,
                    UseShellExecute = true
                };
                Process.Start(psi);
                FileLogger.Log($"[InteractiveLauncher] Process.Start executado para '{exePath}'.");
                return true;
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"[InteractiveLauncher] Fallback falhou ao iniciar '{exePath}'", ex);
                return false;
            }
        }
    }
}
