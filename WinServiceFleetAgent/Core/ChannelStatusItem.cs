using System;

namespace WinServiceFleetAgent.Core
{
    public class ChannelStatusItem
    {
        public string Title { get; set; } = string.Empty;
        public string RawProgName { get; set; } = string.Empty;
        public string Pais { get; set; } = "Brasil";
        public string Cidade { get; set; } = string.Empty;
        public string Veiculo { get; set; } = string.Empty;
        public string MeiodeTransmissao { get; set; } = "Digital Terrestre";
        public string Frequencia { get; set; } = "N/A";
        public int TunerID { get; set; } = -1;
        public int? QualidadeSinal { get; set; }
        public int? ForcaSinal { get; set; }
        public string StatusTuner { get; set; } = "N/A";
        public string VideoCongelado { get; set; } = "Não";
        public string AudioMudo { get; set; } = "Não";
        public string GravandoMP4 { get; set; } = "Não";
        public string GravandoMP3 { get; set; } = "Não";
        public int IDHost { get; set; } = 1;
        public int IDCS { get; set; } = 1;
        public string PastaGravacaoMP4 { get; set; } = "N/A";
        public string PastaGravacaoMP3 { get; set; } = "N/A";
        public string UrlStreaming { get; set; } = "N/A";
        public string SourceAnalogico { get; set; } = "N/A";
        public string AnalogAudioDevice { get; set; } = "N/A";
        public string Atualizacao { get; set; } = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ");
    }
}
