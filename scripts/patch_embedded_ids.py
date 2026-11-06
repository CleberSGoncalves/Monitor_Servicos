with open(r'WinServiceFleetAgent\Core\SharePointClient.cs', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Update LoadLocalItemIds with EmbeddedResource fallback
target_old_load = '''        private static void LoadLocalItemIds()
        {
            try
            {
                if (File.Exists(ServiceIdsFilePath))
                {
                    string json = File.ReadAllText(ServiceIdsFilePath);
                    var dict = JsonSerializer.Deserialize<Dictionary<string, string>>(json);
                    if (dict != null)
                    {
                        foreach (var kvp in dict)
                        {
                            _serviceItemIdCache[kvp.Key] = kvp.Value;
                        }
                        FileLogger.Log($"[SharePointClient] 💾 {_serviceItemIdCache.Count} IDs de serviços carregados do cache persistente em disco ({ServiceIdsFilePath}).");
                    }
                }
            }
            catch (Exception ex)
            {
                FileLogger.Log($"[SharePointClient] Aviso ao ler {ServiceIdsFilePath}: {ex.Message}");
            }

            try
            {
                if (File.Exists(ChannelIdsFilePath))
                {
                    string json = File.ReadAllText(ChannelIdsFilePath);
                    var dict = JsonSerializer.Deserialize<Dictionary<string, string>>(json);
                    if (dict != null)
                    {
                        foreach (var kvp in dict)
                        {
                            _channelItemIdCache[kvp.Key] = kvp.Value;
                        }
                        FileLogger.Log($"[SharePointClient] 💾 {_channelItemIdCache.Count} IDs de canais carregados do cache persistente em disco ({ChannelIdsFilePath}).");
                    }
                }
            }
            catch (Exception ex)
            {
                FileLogger.Log($"[SharePointClient] Aviso ao ler {ChannelIdsFilePath}: {ex.Message}");
            }
        }'''

new_load = '''        private static void LoadLocalItemIds()
        {
            try
            {
                if (File.Exists(ServiceIdsFilePath))
                {
                    string json = File.ReadAllText(ServiceIdsFilePath);
                    var dict = JsonSerializer.Deserialize<Dictionary<string, string>>(json);
                    if (dict != null)
                    {
                        foreach (var kvp in dict)
                        {
                            _serviceItemIdCache[kvp.Key] = kvp.Value;
                        }
                        FileLogger.Log($"[SharePointClient] 💾 {_serviceItemIdCache.Count} IDs de serviços carregados do disco ({ServiceIdsFilePath}).");
                    }
                }
            }
            catch (Exception ex)
            {
                FileLogger.Log($"[SharePointClient] Aviso ao ler {ServiceIdsFilePath}: {ex.Message}");
            }

            // Fallback Resiliente: Se não encontrou no disco, carrega dos Recursos Embutidos (Assembly Manifest)
            if (_serviceItemIdCache.IsEmpty)
            {
                try
                {
                    var asm = System.Reflection.Assembly.GetExecutingAssembly();
                    using var stream = asm.GetManifestResourceStream("WinServiceFleetAgent.sharepoint_service_ids.json");
                    if (stream != null)
                    {
                        using var reader = new System.IO.StreamReader(stream);
                        string json = reader.ReadToEnd();
                        var dict = JsonSerializer.Deserialize<Dictionary<string, string>>(json);
                        if (dict != null)
                        {
                            foreach (var kvp in dict)
                            {
                                _serviceItemIdCache[kvp.Key] = kvp.Value;
                            }
                            FileLogger.Log($"[SharePointClient] 💎 {_serviceItemIdCache.Count} IDs de serviços carregados dos Recursos Embutidos no binário.");
                            try { File.WriteAllText(ServiceIdsFilePath, json); } catch { }
                        }
                    }
                }
                catch (Exception ex)
                {
                    FileLogger.Log($"[SharePointClient] Falha ao carregar IDs de serviços embutidos: {ex.Message}");
                }
            }

            try
            {
                if (File.Exists(ChannelIdsFilePath))
                {
                    string json = File.ReadAllText(ChannelIdsFilePath);
                    var dict = JsonSerializer.Deserialize<Dictionary<string, string>>(json);
                    if (dict != null)
                    {
                        foreach (var kvp in dict)
                        {
                            _channelItemIdCache[kvp.Key] = kvp.Value;
                        }
                        FileLogger.Log($"[SharePointClient] 💾 {_channelItemIdCache.Count} IDs de canais carregados do disco ({ChannelIdsFilePath}).");
                    }
                }
            }
            catch (Exception ex)
            {
                FileLogger.Log($"[SharePointClient] Aviso ao ler {ChannelIdsFilePath}: {ex.Message}");
            }

            if (_channelItemIdCache.IsEmpty)
            {
                try
                {
                    var asm = System.Reflection.Assembly.GetExecutingAssembly();
                    using var stream = asm.GetManifestResourceStream("WinServiceFleetAgent.sharepoint_channel_ids.json");
                    if (stream != null)
                    {
                        using var reader = new System.IO.StreamReader(stream);
                        string json = reader.ReadToEnd();
                        var dict = JsonSerializer.Deserialize<Dictionary<string, string>>(json);
                        if (dict != null)
                        {
                            foreach (var kvp in dict)
                            {
                                _channelItemIdCache[kvp.Key] = kvp.Value;
                            }
                            FileLogger.Log($"[SharePointClient] 💎 {_channelItemIdCache.Count} IDs de canais carregados dos Recursos Embutidos no binário.");
                            try { File.WriteAllText(ChannelIdsFilePath, json); } catch { }
                        }
                    }
                }
                catch { }
            }
        }'''

# Check if target_old_load or CRLF version is present
if target_old_load in text:
    text = text.replace(target_old_load, new_load, 1)
    print("Replaced LoadLocalItemIds (LF)!")
else:
    # Try normalized
    import re
    pos_start = text.find("private static void LoadLocalItemIds()")
    if pos_start != -1:
        # Find ending of this method (search for next method public static void SaveLocalServiceId)
        pos_end = text.find("public static void SaveLocalServiceId", pos_start)
        if pos_end != -1:
            text = text[:pos_start] + new_load + "\n\n        " + text[pos_end:]
            print("Replaced LoadLocalItemIds by slice!")

# 2. Prevent GetAllListItemsAsync flood in SyncServiceInventoryAsync Step 3
old_step3 = '''                    // 3. APENAS COMO ÚLTIMO RECURSO: Baixa a lista completa se o ID ainda for desconhecido
                    if (string.IsNullOrEmpty(itemId))
                    {
                        var allItems = await GetAllListItemsAsync(client);
                        if (allItems == null)
                        {
                            FileLogger.Log($"[SharePointClient] ⚠️ Consulta de lista indisponível por Throttling do Microsoft Graph (HTTP 429). Preservando registro [{cleanHost}_{cleanSrv}] para o próximo ciclo.");
                            return "Não";
                        }'''

pos_step3 = text.find("APENAS COMO")
if pos_step3 != -1:
    pos_step3_header = text.rfind("// 3.", 0, pos_step3)
    pos_next = text.find("var matchingItems = new List<JsonElement>();", pos_step3)
    if pos_next != -1:
        pos_after_matching = text.find("if (string.IsNullOrEmpty(itemId))\n                    {\n                        fieldsPayload", pos_next)
        if pos_after_matching == -1:
            pos_after_matching = text.find("if (string.IsNullOrEmpty(itemId))\r\n                    {\r\n                        fieldsPayload", pos_next)
        
        if pos_after_matching != -1:
            safe_step3 = '''// 3. ID não localizado no cache embutido: Bypass defensivo para não estourar cota Graph API
                    if (string.IsNullOrEmpty(itemId))
                    {
                        FileLogger.Log($"[SharePointClient] ⚠️ ID do SharePoint não mapeado para [{cleanHost}_{cleanSrv}]. Preservando registro sem paginação massiva.");
                        return "Não";
                    }

                    '''
            text = text[:pos_step3_header] + safe_step3 + text[pos_after_matching:]
            print("Safe step 3 replaced without GetAllListItemsAsync flood!")

with open(r'WinServiceFleetAgent\Core\SharePointClient.cs', 'w', encoding='utf-8') as f:
    f.write(text)

print("SharePointClient.cs patched with Embedded Resources!")
