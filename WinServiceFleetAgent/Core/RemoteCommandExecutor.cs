using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace WinServiceFleetAgent.Core
{
    public class RemoteCommandConfig
    {
        public bool Enabled { get; set; } = true;
        public int MaxCommandsPerCycle { get; set; } = 3;
        public int DefaultTimeoutSeconds { get; set; } = 120;
        public int MaxTimeoutSeconds { get; set; } = 300;
        public int MaxCommandAgeMinutes { get; set; } = 30;
        public int MaxOutputChars { get; set; } = 60000;
    }

    /// <summary>
    /// Canal REAL Dashboard ⇄ Capture Site (v1.0.16.0).
    ///
    /// Fluxo: Dashboard grava Fila_Comandos/{HOST}/pending/{id}.json (assinado HMAC-SHA256) no SharePoint Drive →
    /// o agente consulta a pasta 1x por ciclo, valida assinatura/idade, executa com prioridade BAIXA,
    /// timeout e limite de saída, e devolve Fila_Comandos/{HOST}/results/{id}.json.
    ///
    /// Diretriz de recursos: nada roda em background contínuo. Sem fila = 1 GET (404) por ciclo.
    /// Execução sempre sequencial (1 comando por vez), BelowNormal, kill da árvore no timeout.
    /// </summary>
    public class RemoteCommandExecutor
    {
        private const string QueueRoot = "Fila_Comandos";
        private static readonly SemaphoreSlim _busy = new(1, 1);
        private static readonly HashSet<string> _processed = new(StringComparer.OrdinalIgnoreCase);

        private readonly SharePointClient _sp;
        private readonly string _hostname;
        private readonly RemoteCommandConfig _cfg;
        private readonly string _agentVersion;

        public RemoteCommandExecutor(SharePointClient sp, string hostname, RemoteCommandConfig? cfg = null)
        {
            _sp = sp;
            _hostname = hostname.Trim();
            _cfg = cfg ?? new RemoteCommandConfig();
            _agentVersion = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "1.0.16.0";
            LoadProcessedHistory();
        }

        /// <summary>Chamado a cada ciclo. Não bloqueia o ciclo: executa em background com exclusão mútua.</summary>
        public void PollInBackground()
        {
            if (!_cfg.Enabled) return;
            if (!_busy.Wait(0)) return; // já existe um comando em execução — não empilha trabalho
            _ = Task.Run(async () =>
            {
                try { await PollAndExecuteAsync(); }
                catch (Exception ex) { FileLogger.LogError("[RemoteCommand] Erro no processamento da fila", ex); }
                finally { _busy.Release(); }
            });
        }

        private async Task PollAndExecuteAsync()
        {
            string pendingDir = $"{QueueRoot}/{_hostname}/pending";
            var files = (await _sp.ListDriveFolderFileNamesAsync(pendingDir))
                .Where(n => n.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
                .OrderBy(n => n, StringComparer.Ordinal)
                .Take(Math.Max(1, _cfg.MaxCommandsPerCycle))
                .ToList();

            if (files.Count == 0) return;
            FileLogger.Log($"[RemoteCommand] 📥 {files.Count} comando(s) na fila de '{_hostname}'.");

            foreach (var file in files)
            {
                string pendingPath = $"{pendingDir}/{file}";
                string execId = Path.GetFileNameWithoutExtension(file);

                if (_processed.Contains(execId))
                {
                    await _sp.DeleteDriveItemAsync(pendingPath);
                    continue;
                }

                string? json = await _sp.DownloadDriveTextAsync(pendingPath);
                var result = new Dictionary<string, object?>
                {
                    ["exec_id"] = execId,
                    ["host"] = _hostname,
                    ["agent_version"] = _agentVersion,
                    ["started_at"] = DateTime.UtcNow.ToString("o")
                };

                RemoteCommandPayload? cmd = null;
                string? rejectReason = null;
                try
                {
                    cmd = string.IsNullOrWhiteSpace(json) ? null : JsonSerializer.Deserialize<RemoteCommandPayload>(json!);
                }
                catch (Exception ex) { rejectReason = $"JSON inválido: {ex.Message}"; }

                if (cmd == null && rejectReason == null) rejectReason = "Payload vazio.";
                if (cmd != null) rejectReason = Validate(cmd, execId);

                if (rejectReason != null)
                {
                    FileLogger.LogError($"[RemoteCommand] ⛔ Comando '{execId}' rejeitado: {rejectReason}", writeToEventLog: true, eventId: 3200);
                    result["status"] = "rejeitado";
                    result["exit_code"] = -1;
                    result["stdout"] = "";
                    result["stderr"] = rejectReason;
                    result["duration_ms"] = 0;
                }
                else
                {
                    // ACK: Dashboard passa a mostrar "em execução no agente"
                    await _sp.UploadDriveTextAsync($"{QueueRoot}/{_hostname}/results/{execId}.json",
                        JsonSerializer.Serialize(new Dictionary<string, object?>(result) { ["status"] = "em_execucao" }));

                    FileLogger.Log($"[RemoteCommand] ▶️ Executando '{cmd!.title}' ({cmd.shell}) solicitado por '{cmd.requested_by}' [id {execId}]", writeToEventLog: true, eventId: 1200);
                    var sw = Stopwatch.StartNew();
                    var (status, exit, stdout, stderr) = await ExecuteAsync(cmd);
                    sw.Stop();
                    result["status"] = status;
                    result["exit_code"] = exit;
                    result["stdout"] = Cap(stdout, _cfg.MaxOutputChars);
                    result["stderr"] = Cap(stderr, 10000);
                    result["duration_ms"] = (long)sw.Elapsed.TotalMilliseconds;
                    FileLogger.Log($"[RemoteCommand] ✅ '{execId}' finalizado: {status} (exit {exit}, {sw.Elapsed.TotalSeconds:F1}s)");
                }

                result["finished_at"] = DateTime.UtcNow.ToString("o");
                bool uploaded = await _sp.UploadDriveTextAsync($"{QueueRoot}/{_hostname}/results/{execId}.json", JsonSerializer.Serialize(result));
                if (uploaded)
                {
                    MarkProcessed(execId);
                    await _sp.DeleteDriveItemAsync(pendingPath);
                }
            }
        }

        private string? Validate(RemoteCommandPayload cmd, string execId)
        {
            if (!string.Equals(cmd.exec_id, execId, StringComparison.OrdinalIgnoreCase)) return "exec_id não confere com o arquivo.";
            if (!string.Equals(cmd.host?.Trim(), _hostname, StringComparison.OrdinalIgnoreCase)) return $"Comando destinado a outro host ('{cmd.host}').";
            if (string.IsNullOrWhiteSpace(cmd.script)) return "Script vazio.";
            if (!DateTime.TryParse(cmd.created_at, null, System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal, out var created))
                return "created_at inválido.";
            var age = DateTime.UtcNow - created;
            if (age.TotalMinutes > _cfg.MaxCommandAgeMinutes) return $"Comando expirado ({age.TotalMinutes:F0} min > {_cfg.MaxCommandAgeMinutes} min).";
            if (age.TotalMinutes < -5) return "created_at no futuro (relógio divergente).";

            string key = _sp.CommandSigningKey;
            if (string.IsNullOrWhiteSpace(key)) return "Chave de assinatura indisponível no agente.";
            string expected = Sign(key, cmd);
            if (!CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(expected), Encoding.ASCII.GetBytes((cmd.sig ?? "").ToLowerInvariant())))
                return "Assinatura HMAC inválida (comando não originado pelo Dashboard oficial).";
            return null;
        }

        /// <summary>Mesmo algoritmo do Dashboard (remote_queue.py): HMAC-SHA256 hex.</summary>
        public static string Sign(string key, RemoteCommandPayload c)
        {
            string canonical = $"{c.exec_id}\n{c.host}\n{c.shell}\n{c.created_at}\n{c.timeout_s}\n{c.script}";
            using var h = new HMACSHA256(Encoding.UTF8.GetBytes(key));
            return Convert.ToHexString(h.ComputeHash(Encoding.UTF8.GetBytes(canonical))).ToLowerInvariant();
        }

        private async Task<(string status, int exit, string stdout, string stderr)> ExecuteAsync(RemoteCommandPayload cmd)
        {
            int timeout = cmd.timeout_s > 0 ? Math.Min(cmd.timeout_s, _cfg.MaxTimeoutSeconds) : _cfg.DefaultTimeoutSeconds;
            string shell = (cmd.shell ?? "powershell").Trim().ToLowerInvariant();

            if (shell == "tail_log")
            {
                // Leitura nativa (sem spawn de processo): "caminho|linhas"
                try
                {
                    var parts = cmd.script.Split('|');
                    int lines = parts.Length > 1 && int.TryParse(parts[1], out int n) ? Math.Clamp(n, 10, 2000) : 200;
                    return ("sucesso", 0, TailLog(parts[0].Trim(), lines), "");
                }
                catch (Exception ex) { return ("erro", 1, "", ex.Message); }
            }

            string tempScript = "";
            var psi = new ProcessStartInfo
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8,
                WorkingDirectory = Path.GetTempPath()
            };

            if (shell == "cmd")
            {
                tempScript = Path.Combine(Path.GetTempPath(), $"dna_cmd_{Guid.NewGuid():N}.cmd");
                await File.WriteAllTextAsync(tempScript, "@echo off\r\nchcp 65001 >nul\r\n" + cmd.script, new UTF8Encoding(false));
                psi.FileName = "cmd.exe";
                psi.Arguments = $"/d /c \"{tempScript}\"";
            }
            else
            {
                // Executa o bloco inteiro e formata a saída com largura fixa para leitura no Dashboard
                string wrapped = "$ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[Text.Encoding]::UTF8; $ErrorActionPreference='Continue';\n& {\n"
                               + cmd.script + "\n} | Out-String -Width 220";
                psi.FileName = "powershell.exe";
                psi.Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand " + Convert.ToBase64String(Encoding.Unicode.GetBytes(wrapped));
            }

            var stdout = new StringBuilder();
            var stderr = new StringBuilder();
            try
            {
                using var proc = new Process { StartInfo = psi };
                proc.OutputDataReceived += (_, e) => { if (e.Data != null && stdout.Length < _cfg.MaxOutputChars + 1000) stdout.AppendLine(e.Data); };
                proc.ErrorDataReceived += (_, e) => { if (e.Data != null && stderr.Length < 12000) stderr.AppendLine(e.Data); };
                proc.Start();
                try { proc.PriorityClass = ProcessPriorityClass.BelowNormal; } catch { }
                proc.BeginOutputReadLine();
                proc.BeginErrorReadLine();

                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(timeout));
                try
                {
                    await proc.WaitForExitAsync(cts.Token);
                }
                catch (OperationCanceledException)
                {
                    try { proc.Kill(true); } catch { }
                    return ("timeout", -2, stdout.ToString(), $"Tempo limite de {timeout}s excedido. Processo encerrado para proteger o Capture Site.\n{stderr}");
                }
                proc.WaitForExit(); // drena buffers assíncronos
                return (proc.ExitCode == 0 ? "sucesso" : "erro", proc.ExitCode, stdout.ToString(), stderr.ToString());
            }
            catch (Exception ex)
            {
                return ("erro", -1, stdout.ToString(), ex.Message);
            }
            finally
            {
                if (!string.IsNullOrEmpty(tempScript)) { try { File.Delete(tempScript); } catch { } }
            }
        }

        /// <summary>Últimas N linhas do arquivo (ou do arquivo mais recente da pasta), lendo no máximo 2 MB do final.</summary>
        public static string TailLog(string path, int lines)
        {
            string file = path;
            if (Directory.Exists(path))
            {
                var latest = new DirectoryInfo(path).EnumerateFiles("*.*")
                    .Where(f => f.Extension is ".txt" or ".log" or ".TXT" or ".LOG")
                    .OrderByDescending(f => f.LastWriteTimeUtc).FirstOrDefault();
                if (latest == null) return $"Nenhum arquivo .txt/.log em '{path}'.";
                file = latest.FullName;
            }
            if (!File.Exists(file)) return $"Arquivo não encontrado: '{file}'.";

            const long maxBytes = 2 * 1024 * 1024;
            using var fs = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            long start = Math.Max(0, fs.Length - maxBytes);
            fs.Seek(start, SeekOrigin.Begin);
            using var sr = new StreamReader(fs, Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
            var all = sr.ReadToEnd().Split('\n');
            var tail = all.Skip(Math.Max(0, all.Length - lines)).Select(l => l.TrimEnd('\r'));
            var info = new FileInfo(file);
            return $"### {file} ({info.Length / 1024} KB, modificado {info.LastWriteTime:dd/MM/yyyy HH:mm:ss}) — últimas {lines} linhas\n" + string.Join("\n", tail);
        }

        private static string Cap(string s, int max) =>
            string.IsNullOrEmpty(s) || s.Length <= max ? (s ?? "") : s.Substring(0, max) + $"\n... [saída truncada em {max} caracteres]";

        private static string HistoryFile => Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "logs", "remote_commands_processed.txt");

        private static void LoadProcessedHistory()
        {
            try
            {
                if (!File.Exists(HistoryFile)) return;
                lock (_processed)
                    foreach (var l in File.ReadLines(HistoryFile).TakeLast(300)) if (!string.IsNullOrWhiteSpace(l)) _processed.Add(l.Trim());
            }
            catch { }
        }

        private static void MarkProcessed(string execId)
        {
            lock (_processed) _processed.Add(execId);
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(HistoryFile)!);
                File.AppendAllText(HistoryFile, execId + Environment.NewLine);
            }
            catch { }
        }
    }

    public class RemoteCommandPayload
    {
        public string exec_id { get; set; } = "";
        public string host { get; set; } = "";
        public string title { get; set; } = "";
        public string shell { get; set; } = "powershell";
        public string script { get; set; } = "";
        public string requested_by { get; set; } = "";
        public string created_at { get; set; } = "";
        public int timeout_s { get; set; } = 120;
        public string sig { get; set; } = "";
    }
}
