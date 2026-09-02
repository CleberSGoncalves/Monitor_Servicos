namespace WinServiceFleetAgent.Core
{
    public class ServiceDefinition
    {
        public string ServiceName { get; set; } = string.Empty;
        public string InstallPath { get; set; } = string.Empty;
        public string ExeName { get; set; } = string.Empty;
        public string ConfigFile { get; set; } = string.Empty;
        public string GithubRepo { get; set; } = string.Empty;
    }
}
