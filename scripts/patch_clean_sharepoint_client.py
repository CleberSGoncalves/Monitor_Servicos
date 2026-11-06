import sys

with open(r'WinServiceFleetAgent\Core\SharePointClient.cs', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Update LoadLocalItemIds with EmbeddedResource fallback
target_old_catch1 = '''            catch (Exception ex)
            {
                FileLogger.Log($"[SharePointClient] Aviso ao ler {ServiceIdsFilePath}: {ex.Message}");
            }'''

embedded_services_code = '''            catch (Exception ex)
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
                            foreach (var kvp in dict) _serviceItemIdCache[kvp.Key] = kvp.Value;
                            FileLogger.Log($"[SharePointClient] 💎 {_serviceItemIdCache.Count} IDs de serviços carregados dos Recursos Embutidos no binário.");
                            try { File.WriteAllText(ServiceIdsFilePath, json); } catch { }
                        }
                    }
                }
                catch (Exception ex)
                {
                    FileLogger.Log($"[SharePointClient] Falha ao carregar IDs de serviços embutidos: {ex.Message}");
                }
            }'''

text = text.replace(target_old_catch1, embedded_services_code, 1)

target_old_catch2 = '''            catch (Exception ex)
            {
                FileLogger.Log($"[SharePointClient] Aviso ao ler {ChannelIdsFilePath}: {ex.Message}");
            }'''

embedded_channels_code = '''            catch (Exception ex)
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
                            foreach (var kvp in dict) _channelItemIdCache[kvp.Key] = kvp.Value;
                            FileLogger.Log($"[SharePointClient] 💎 {_channelItemIdCache.Count} IDs de canais carregados dos Recursos Embutidos no binário.");
                            try { File.WriteAllText(ChannelIdsFilePath, json); } catch { }
                        }
                    }
                }
                catch { }
            }'''

text = text.replace(target_old_catch2, embedded_channels_code, 1)

# 2. Replace Step 3 in SyncServiceInventoryAsync
pos_step3 = text.find("// 3. APENAS COMO")
if pos_step3 != -1:
    pos_praca = text.find("string safePraca = string.IsNullOrWhiteSpace(praca)", pos_step3)
    if pos_praca != -1:
        safe_step3 = '''// 3. Fallback pontual: Se o ID ainda não for conhecido, evita paginação massiva de 3000 itens para proteger cota Graph API
                    if (string.IsNullOrEmpty(itemId))
                    {
                        FileLogger.Log($"[SharePointClient] ⚠️ ID do SharePoint não mapeado no cache embutido para [{cleanHost}_{cleanSrv}]. Preservando registro para o próximo ciclo.");
                        return "Não";
                    }

                    '''
        text = text[:pos_step3] + safe_step3 + text[pos_praca:]
        print("Replaced Step 3 with safe fallback!")

with open(r'WinServiceFleetAgent\Core\SharePointClient.cs', 'w', encoding='utf-8') as f:
    f.write(text)

print("SUCCESS: SharePointClient.cs patched cleanly!")
