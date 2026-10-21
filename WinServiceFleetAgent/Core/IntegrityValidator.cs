using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Security.Cryptography;

namespace WinServiceFleetAgent.Core
{
    public static class IntegrityValidator
    {
        public static string ComputeSha256(string filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
            {
                return string.Empty;
            }

            try
            {
                using var sha256 = SHA256.Create();
                using var stream = File.OpenRead(filePath);
                byte[] hash = sha256.ComputeHash(stream);
                return Convert.ToHexString(hash).ToLowerInvariant();
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"[IntegrityValidator] Erro ao calcular SHA256 de '{filePath}'", ex);
                return string.Empty;
            }
        }

        public static bool VerifySha256(string filePath, string expectedHash)
        {
            if (string.IsNullOrWhiteSpace(expectedHash)) return false;
            string actual = ComputeSha256(filePath);
            return string.Equals(actual, expectedHash.Trim(), StringComparison.OrdinalIgnoreCase);
        }

        public static (bool IsValid, string Message) ValidateZipArchive(string zipFilePath, string requiredExeName = "WinServiceFleetAgent.exe")
        {
            if (string.IsNullOrWhiteSpace(zipFilePath) || !File.Exists(zipFilePath))
            {
                return (false, $"Arquivo ZIP não encontrado: '{zipFilePath}'");
            }

            var fi = new FileInfo(zipFilePath);
            if (fi.Length < 1024)
            {
                return (false, $"Arquivo ZIP excessivamente pequeno ({fi.Length} bytes), provável arquivo corrompido ou resposta de erro.");
            }

            try
            {
                using var archive = ZipFile.OpenRead(zipFilePath);
                if (archive.Entries.Count == 0)
                {
                    return (false, "Arquivo ZIP está vazio (0 entradas).");
                }

                bool foundExe = false;
                foreach (var entry in archive.Entries)
                {
                    string name = Path.GetFileName(entry.FullName);
                    if (name.Equals(requiredExeName, StringComparison.OrdinalIgnoreCase))
                    {
                        foundExe = true;
                    }

                    // Valida integridade do cabeçalho de cada entrada abrindo o stream de leitura
                    using var stream = entry.Open();
                    byte[] buffer = new byte[1024];
                    stream.Read(buffer, 0, Math.Min(buffer.Length, (int)Math.Min(entry.Length, 1024)));
                }

                if (!foundExe)
                {
                    return (false, $"Executável obrigatório '{requiredExeName}' não encontrado no arquivo ZIP.");
                }

                return (true, $"ZIP validado com sucesso. {archive.Entries.Count} entradas verificadas.");
            }
            catch (InvalidDataException ex)
            {
                return (false, $"Estrutura do ZIP corrompida: {ex.Message}");
            }
            catch (Exception ex)
            {
                return (false, $"Erro na validação do ZIP: {ex.Message}");
            }
        }

        public static (bool IsValid, string Version, string Message) ValidateExecutable(
            string exeFilePath,
            string? expectedVersion = null,
            long minimumSizeBytes = 1_000_000)
        {
            if (string.IsNullOrWhiteSpace(exeFilePath) || !File.Exists(exeFilePath))
            {
                return (false, "", $"Executável não encontrado: '{exeFilePath}'");
            }

            var fi = new FileInfo(exeFilePath);
            if (fi.Length < minimumSizeBytes)
            {
                return (false, "", $"Tamanho do executável ({fi.Length} bytes) abaixo do limite mínimo de segurança ({minimumSizeBytes} bytes).");
            }

            try
            {
                var vi = FileVersionInfo.GetVersionInfo(exeFilePath);
                string detectedVersion = vi.FileVersion?.Trim() ?? string.Empty;
                if (string.IsNullOrWhiteSpace(detectedVersion))
                {
                    detectedVersion = $"{vi.FileMajorPart}.{vi.FileMinorPart}.{vi.FileBuildPart}.{vi.FilePrivatePart}";
                }

                if (string.IsNullOrWhiteSpace(detectedVersion) || detectedVersion == "0.0.0.0")
                {
                    return (false, detectedVersion, "Metadados de versão do executável inválidos ou nulos (PE header ilegível).");
                }

                if (!string.IsNullOrWhiteSpace(expectedVersion))
                {
                    string cleanExpected = expectedVersion.Trim().TrimStart('v', 'V');
                    string cleanDetected = detectedVersion.Trim().TrimStart('v', 'V');

                    if (Version.TryParse(cleanExpected, out var vExp) && Version.TryParse(cleanDetected, out var vDet))
                    {
                        if (vDet < vExp)
                        {
                            return (false, detectedVersion, $"Versão do binário extraído ({cleanDetected}) é menor que a versão esperada ({cleanExpected}).");
                        }
                    }
                    else if (!cleanDetected.StartsWith(cleanExpected, StringComparison.OrdinalIgnoreCase))
                    {
                        return (false, detectedVersion, $"Versão do binário extraído ({cleanDetected}) difere da versão esperada ({cleanExpected}).");
                    }
                }

                return (true, detectedVersion, $"Executável validado com sucesso. Versão: {detectedVersion}, Tamanho: {fi.Length:N0} bytes.");
            }
            catch (Exception ex)
            {
                return (false, "", $"Falha ao ler cabeçalho PE do executável: {ex.Message}");
            }
        }
    }
}
