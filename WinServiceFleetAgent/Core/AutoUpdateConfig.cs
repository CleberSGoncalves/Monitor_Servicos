using System;

namespace WinServiceFleetAgent.Core
{
    public class AutoUpdateConfig
    {
        public bool Enabled { get; set; } = true;
        public int CheckIntervalMinutes { get; set; } = 60;
        public string Source { get; set; } = "GitHub"; // "GitHub", "HttpEndpoint", "FileShare"
        public string GitHubRepo { get; set; } = "CleberSGoncalves/DNA.MonitorServiceSVC";
        public string EndpointUrl { get; set; } = string.Empty;
        public string FileSharePath { get; set; } = string.Empty;
        public string CompareMethod { get; set; } = "Version"; // "Version", "Hash", "VersionOrHash"
        public bool RequireSha256Validation { get; set; } = false;
        public bool AllowDowngrade { get; set; } = false;
    }

    public class UpdateCheckResult
    {
        public bool IsUpdateAvailable { get; set; }
        public string LatestVersion { get; set; } = string.Empty;
        public string CurrentVersion { get; set; } = string.Empty;
        public string PackageDownloadUrl { get; set; } = string.Empty;
        public string ExpectedSha256 { get; set; } = string.Empty;
        public string Source { get; set; } = string.Empty;
        public string Reason { get; set; } = string.Empty;
    }
}
