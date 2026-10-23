using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;

namespace WinServiceFleetAgent.Core
{
    /// <summary>
    /// Abre aplicações GUI (ex: Atria Capture / DigitalTVCapture.exe) na sessão do usuário logado
    /// a partir de um Serviço Windows (Sessão 0).
    ///
    /// IMPORTANTE (v1.0.16.0): Processos iniciados diretamente pelo serviço (Process.Start / Start-Process)
    /// nascem na Sessão 0 (isolada) — aparecem no Gerenciador de Tarefas, consomem CPU/RAM,
    /// mas NUNCA exibem janela. Este launcher:
    ///   1. Localiza a sessão de usuário ativa (Console, RDP ou TeamViewer) via WTSEnumerateSessions;
    ///   2. Usa o token ELEVADO (linked token) do usuário para apps que exigem Administrador (evita Win32 740);
    ///   3. Fallback: token SYSTEM re-sessionado para a sessão do usuário (janela visível);
    ///   4. NUNCA faz fallback para Process.Start quando roda como serviço (evita instâncias fantasmas na Sessão 0).
    /// </summary>
    public static class InteractiveProcessLauncher
    {
        #region Win32
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint WTSGetActiveConsoleSessionId();

        [DllImport("wtsapi32.dll", SetLastError = true)]
        private static extern bool WTSQueryUserToken(uint sessionId, out IntPtr phToken);

        [DllImport("wtsapi32.dll", SetLastError = true)]
        private static extern bool WTSEnumerateSessions(IntPtr hServer, int reserved, int version, out IntPtr ppSessionInfo, out int pCount);

        [DllImport("wtsapi32.dll")]
        private static extern void WTSFreeMemory(IntPtr pMemory);

        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern bool DuplicateTokenEx(IntPtr hExistingToken, uint dwDesiredAccess, IntPtr lpTokenAttributes,
            int impersonationLevel, int tokenType, out IntPtr phNewToken);

        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern bool GetTokenInformation(IntPtr tokenHandle, int tokenInformationClass, IntPtr tokenInformation,
            int tokenInformationLength, out int returnLength);

        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern bool SetTokenInformation(IntPtr tokenHandle, int tokenInformationClass, ref uint tokenInformation, int tokenInformationLength);

        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern bool OpenProcessToken(IntPtr processHandle, uint desiredAccess, out IntPtr tokenHandle);

        [DllImport("userenv.dll", SetLastError = true)]
        private static extern bool CreateEnvironmentBlock(out IntPtr lpEnvironment, IntPtr hToken, bool bInherit);

        [DllImport("userenv.dll", SetLastError = true)]
        private static extern bool DestroyEnvironmentBlock(IntPtr lpEnvironment);

        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool CreateProcessAsUser(IntPtr hToken, string? lpApplicationName, string? lpCommandLine,
            IntPtr lpProcessAttributes, IntPtr lpThreadAttributes, bool bInheritHandles, uint dwCreationFlags,
            IntPtr lpEnvironment, string? lpCurrentDirectory, ref STARTUPINFO lpStartupInfo, out PROCESS_INFORMATION lpProcessInformation);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr hObject);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct STARTUPINFO
        {
            public int cb;
            public string? lpReserved;
            public string? lpDesktop;
            public string? lpTitle;
            public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
            public short wShowWindow;
            public short cbReserved2;
            public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct PROCESS_INFORMATION
        {
            public IntPtr hProcess;
            public IntPtr hThread;
            public int dwProcessId;
            public int dwThreadId;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct WTS_SESSION_INFO
        {
            public uint SessionID;
            [MarshalAs(UnmanagedType.LPStr)] public string pWinStationName;
            public int State;
        }

        private const uint MAXIMUM_ALLOWED = 0x02000000;
        private const uint TOKEN_ALL_ACCESS = 0xF01FF;
        private const uint CREATE_NEW_CONSOLE = 0x00000010;
        private const uint CREATE_UNICODE_ENVIRONMENT = 0x00000400;
        private const int STARTF_USESHOWWINDOW = 0x00000001;
        private const short SW_SHOW = 5;
        private const int TokenSessionId = 12;
        private const int TokenLinkedToken = 19;
        private const int WTSActive = 0;
        private const int SecurityImpersonation = 2;
        private const int TokenPrimary = 1;
        #endregion

        /// <summary>Nomes de processo do ecossistema Atria (GUI + receivers filhos).</summary>
        public static readonly string[] AtriaProcessNames = { "DigitalTVCapture", "AtriaCapture", "Atria", "DigitalTVReceiver" };
        private static readonly string[] AtriaMainProcessNames = { "DigitalTVCapture", "AtriaCapture", "Atria" };

        /// <summary>Retorna a sessão de usuário ativa (Console/RDP/TeamViewer) ou null se ninguém estiver logado.</summary>
        public static uint? GetActiveUserSessionId()
        {
            uint? fallbackRdp = null;
            try
            {
                if (WTSEnumerateSessions(IntPtr.Zero, 0, 1, out IntPtr pInfo, out int count))
                {
                    try
                    {
                        int size = Marshal.SizeOf<WTS_SESSION_INFO>();
                        for (int i = 0; i < count; i++)
                        {
                            var info = Marshal.PtrToStructure<WTS_SESSION_INFO>(pInfo + i * size);
                            if (info.State != WTSActive || info.SessionID == 0) continue;
                            if (!WTSQueryUserToken(info.SessionID, out IntPtr t)) continue;
                            CloseHandle(t);
                            if (string.Equals(info.pWinStationName, "Console", StringComparison.OrdinalIgnoreCase))
                                return info.SessionID;
                            fallbackRdp ??= info.SessionID;
                        }
                    }
                    finally { WTSFreeMemory(pInfo); }
                }
            }
            catch (Exception ex)
            {
                FileLogger.Log($"[InteractiveLauncher] Aviso ao enumerar sessões: {ex.Message}");
            }

            if (fallbackRdp.HasValue) return fallbackRdp;

            uint console = WTSGetActiveConsoleSessionId();
            if (console != 0xFFFFFFFF && console != 0 && WTSQueryUserToken(console, out IntPtr ct))
            {
                CloseHandle(ct);
                return console;
            }
            return null;
        }

        /// <summary>True se existe instância principal do Atria em sessão de usuário (com janela possível).</summary>
        public static bool IsAtriaRunningInUserSession()
        {
            return AtriaMainProcessNames.SelectMany(SafeGetProcesses).Any(p => SafeSessionId(p) > 0);
        }

        /// <summary>True se existe instância do Atria rodando (qualquer sessão).</summary>
        public static bool IsAtriaRunningAnySession()
        {
            return AtriaMainProcessNames.SelectMany(SafeGetProcesses).Any();
        }

        /// <summary>
        /// Encerra instâncias "fantasmas" do Atria presas na Sessão 0 (sem janela).
        /// Só deve ser chamado quando houver sessão de usuário para receber a nova instância.
        /// </summary>
        public static int KillSessionZeroAtriaInstances()
        {
            int killed = 0;
            foreach (var p in AtriaProcessNames.SelectMany(SafeGetProcesses))
            {
                if (SafeSessionId(p) != 0) continue;
                try
                {
                    FileLogger.Log($"[InteractiveLauncher] 👻 Encerrando instância fantasma na Sessão 0: {p.ProcessName} (PID {p.Id})");
                    p.Kill(true);
                    p.WaitForExit(10000);
                    killed++;
                }
                catch (Exception ex)
                {
                    FileLogger.Log($"[InteractiveLauncher] Aviso ao encerrar PID {p.Id}: {ex.Message}");
                }
            }
            return killed;
        }

        public static bool LaunchProcessInActiveSession(string exePath, string? workingDir = null)
        {
            string dir = string.IsNullOrWhiteSpace(workingDir) ? (Path.GetDirectoryName(exePath) ?? AppDomain.CurrentDomain.BaseDirectory) : workingDir!;
            bool runningAsService = Process.GetCurrentProcess().SessionId == 0;

            if (!runningAsService)
            {
                // Execução manual/console (debug): já estamos numa sessão interativa.
                return ShellLaunch(exePath, dir);
            }

            uint? sessionId = GetActiveUserSessionId();
            if (!sessionId.HasValue)
            {
                FileLogger.Log($"[InteractiveLauncher] ⚠️ Nenhum usuário logado (sem sessão interativa ativa). '{Path.GetFileName(exePath)}' NÃO será aberto na Sessão 0 para evitar instância invisível. Nova tentativa no próximo ciclo.");
                return false;
            }

            FileLogger.Log($"[InteractiveLauncher] Abrindo '{exePath}' na sessão de usuário ID {sessionId.Value}...");

            // Tentativa 1: token elevado do próprio usuário (linked token)
            if (TryLaunchWithUserToken(sessionId.Value, exePath, dir, out int err1))
                return true;

            // Tentativa 2: token SYSTEM transportado para a sessão do usuário (janela visível, elevado)
            FileLogger.Log($"[InteractiveLauncher] Token do usuário falhou (Win32 {err1}). Tentando token SYSTEM na sessão {sessionId.Value}...");
            if (TryLaunchWithSystemTokenInSession(sessionId.Value, exePath, dir, out int err2))
                return true;

            FileLogger.LogError($"[InteractiveLauncher] ❌ Não foi possível abrir '{exePath}' na sessão {sessionId.Value} (Win32 {err1}/{err2}).");
            return false;
        }

        private static bool TryLaunchWithUserToken(uint sessionId, string exePath, string dir, out int win32Err)
        {
            win32Err = 0;
            IntPtr hUser = IntPtr.Zero, hLinked = IntPtr.Zero, hPrimary = IntPtr.Zero;
            try
            {
                if (!WTSQueryUserToken(sessionId, out hUser)) { win32Err = Marshal.GetLastWin32Error(); return false; }

                IntPtr source = hUser;
                // Se UAC filtrou o token, usa a versão elevada (Atria exige Administrador)
                IntPtr buf = Marshal.AllocHGlobal(IntPtr.Size);
                try
                {
                    if (GetTokenInformation(hUser, TokenLinkedToken, buf, IntPtr.Size, out _))
                    {
                        hLinked = Marshal.ReadIntPtr(buf);
                        if (hLinked != IntPtr.Zero) source = hLinked;
                    }
                }
                finally { Marshal.FreeHGlobal(buf); }

                if (!DuplicateTokenEx(source, MAXIMUM_ALLOWED, IntPtr.Zero, SecurityImpersonation, TokenPrimary, out hPrimary))
                {
                    win32Err = Marshal.GetLastWin32Error();
                    return false;
                }

                return CreateInSession(hPrimary, exePath, dir, "usuário", sessionId, out win32Err);
            }
            finally
            {
                if (hPrimary != IntPtr.Zero) CloseHandle(hPrimary);
                if (hLinked != IntPtr.Zero) CloseHandle(hLinked);
                if (hUser != IntPtr.Zero) CloseHandle(hUser);
            }
        }

        private static bool TryLaunchWithSystemTokenInSession(uint sessionId, string exePath, string dir, out int win32Err)
        {
            win32Err = 0;
            IntPtr hSelf = IntPtr.Zero, hDup = IntPtr.Zero;
            try
            {
                if (!OpenProcessToken(Process.GetCurrentProcess().Handle, TOKEN_ALL_ACCESS, out hSelf)) { win32Err = Marshal.GetLastWin32Error(); return false; }
                if (!DuplicateTokenEx(hSelf, MAXIMUM_ALLOWED, IntPtr.Zero, SecurityImpersonation, TokenPrimary, out hDup)) { win32Err = Marshal.GetLastWin32Error(); return false; }
                uint sid = sessionId;
                if (!SetTokenInformation(hDup, TokenSessionId, ref sid, sizeof(uint))) { win32Err = Marshal.GetLastWin32Error(); return false; }
                return CreateInSession(hDup, exePath, dir, "SYSTEM", sessionId, out win32Err);
            }
            finally
            {
                if (hDup != IntPtr.Zero) CloseHandle(hDup);
                if (hSelf != IntPtr.Zero) CloseHandle(hSelf);
            }
        }

        private static bool CreateInSession(IntPtr hToken, string exePath, string dir, string tokenKind, uint sessionId, out int win32Err)
        {
            win32Err = 0;
            IntPtr env = IntPtr.Zero;
            try
            {
                CreateEnvironmentBlock(out env, hToken, false);
                var si = new STARTUPINFO
                {
                    cb = Marshal.SizeOf<STARTUPINFO>(),
                    lpDesktop = @"winsta0\default",
                    dwFlags = STARTF_USESHOWWINDOW,
                    wShowWindow = SW_SHOW
                };
                uint flags = CREATE_NEW_CONSOLE | (env != IntPtr.Zero ? CREATE_UNICODE_ENVIRONMENT : 0);
                bool ok = CreateProcessAsUser(hToken, exePath, $"\"{exePath}\"", IntPtr.Zero, IntPtr.Zero, false, flags, env, dir, ref si, out var pi);
                if (!ok)
                {
                    win32Err = Marshal.GetLastWin32Error();
                    return false;
                }
                FileLogger.Log($"[InteractiveLauncher] ✅ '{Path.GetFileName(exePath)}' aberto na sessão {sessionId} (token {tokenKind}, PID {pi.dwProcessId}).");
                CloseHandle(pi.hProcess);
                CloseHandle(pi.hThread);
                return true;
            }
            finally
            {
                if (env != IntPtr.Zero) DestroyEnvironmentBlock(env);
            }
        }

        private static bool ShellLaunch(string exePath, string dir)
        {
            try
            {
                Process.Start(new ProcessStartInfo { FileName = exePath, WorkingDirectory = dir, UseShellExecute = true });
                FileLogger.Log($"[InteractiveLauncher] Process.Start (sessão interativa) executado para '{exePath}'.");
                return true;
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"[InteractiveLauncher] Falha ao iniciar '{exePath}'", ex);
                return false;
            }
        }

        private static IEnumerable<Process> SafeGetProcesses(string name)
        {
            try { return Process.GetProcessesByName(name); } catch { return Array.Empty<Process>(); }
        }

        private static int SafeSessionId(Process p)
        {
            try { return p.SessionId; } catch { return -1; }
        }
    }
}
