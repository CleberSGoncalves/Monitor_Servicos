with open(r'WinServiceFleetAgent\Core\SharePointClient.cs', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Preventive Dirty Check in SyncServiceInventoryAsync
sub_sync = 'string cleanSrv = (nomeServico ?? "").Trim();'
pos_sync = text.find(sub_sync)
if pos_sync != -1 and 'DIRTY-CHECK PREVENTIVO' not in text:
    addition_dirty = '''
            string cacheKey = $"{cleanHost}_{cleanSrv}";
            string shortInstalledVer = FormatShortVersion(versaoInstalada);

            // DIRTY-CHECK PREVENTIVO (Bypass de rede se estado inalterado nos ultimos 30 min):
            if (_lastReportedServiceState.TryGetValue(cacheKey, out var lastReport) &&
                lastReport.Versao == shortInstalledVer &&
                lastReport.Status == statusServico &&
                (DateTime.UtcNow - lastReport.UltimoEnvio).TotalMinutes < 30)
            {
                return "Não";
            }'''
    text = text[:pos_sync + len(sub_sync)] + addition_dirty + text[pos_sync + len(sub_sync):]
    print("Dirty check added to SyncServiceInventoryAsync!")

# 2. Central API bypass in GetPendingActionsAsync
sub_actions = 'string cleanHost = (hostname ?? "").Trim();'
target_pending = 'public async Task<List<PendingActionItem>> GetPendingActionsAsync(string hostname)\n        {'
if target_pending not in text:
    target_pending = 'public async Task<List<PendingActionItem>> GetPendingActionsAsync(string hostname)\r\n        {'

pos_pending = text.find(target_pending)
if pos_pending != -1 and 'pending-actions' not in text:
    pos_clean = text.find(sub_actions, pos_pending)
    if pos_clean != -1:
        addition_central = '''

            // Bypass Central: Consulta acoes pendentes na Central de Monitoracao para nao onerar Graph API
            try
            {
                using (var centralClient = new HttpClient { Timeout = TimeSpan.FromSeconds(3) })
                {
                    var centralResp = await centralClient.GetAsync($"http://10.1.30.1:8092/api/fleet/pending-actions/{cleanHost}");
                    if (centralResp.IsSuccessStatusCode)
                    {
                        var centralJson = await centralResp.Content.ReadAsStringAsync();
                        var actions = JsonSerializer.Deserialize<List<PendingActionItem>>(centralJson);
                        if (actions != null && actions.Count > 0)
                        {
                            return actions;
                        }
                    }
                }
            }
            catch { }'''
        text = text[:pos_clean + len(sub_actions)] + addition_central + text[pos_clean + len(sub_actions):]
        print("Central bypass added to GetPendingActionsAsync!")

# 3. Central API bypass in GetPendingUrlActionsAsync
target_url = 'public async Task<List<PendingActionItem>> GetPendingUrlActionsAsync(string hostname)\n        {'
if target_url not in text:
    target_url = 'public async Task<List<PendingActionItem>> GetPendingUrlActionsAsync(string hostname)\r\n        {'

pos_url = text.find(target_url)
if pos_url != -1 and 'pending-url-actions' not in text:
    pos_clean_url = text.find(sub_actions, pos_url)
    if pos_clean_url != -1:
        addition_url_central = '''

            // Bypass Central: Consulta acoes de URL pendentes na Central para nao onerar Graph API
            try
            {
                using (var centralClient = new HttpClient { Timeout = TimeSpan.FromSeconds(3) })
                {
                    var centralResp = await centralClient.GetAsync($"http://10.1.30.1:8092/api/fleet/pending-url-actions/{cleanHost}");
                    if (centralResp.IsSuccessStatusCode)
                    {
                        var centralJson = await centralResp.Content.ReadAsStringAsync();
                        var actions = JsonSerializer.Deserialize<List<PendingActionItem>>(centralJson);
                        if (actions != null && actions.Count > 0)
                        {
                            return actions;
                        }
                    }
                }
            }
            catch { }'''
        text = text[:pos_clean_url + len(sub_actions)] + addition_url_central + text[pos_clean_url + len(sub_actions):]
        print("Central bypass added to GetPendingUrlActionsAsync!")

with open(r'WinServiceFleetAgent\Core\SharePointClient.cs', 'w', encoding='utf-8') as f:
    f.write(text)

print("SharePointClient.cs updated successfully!")
