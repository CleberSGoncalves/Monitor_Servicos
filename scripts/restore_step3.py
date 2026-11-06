with open(r'WinServiceFleetAgent\Core\SharePointClient.cs', 'r', encoding='utf-8') as f:
    text = f.read()

sub_safe = '''// 3. Fallback pontual: Se o ID ainda não for conhecido, evita paginação massiva de 3000 itens para proteger cota Graph API
                    if (string.IsNullOrEmpty(itemId))
                    {
                        FileLogger.Log($"[SharePointClient] ⚠️ ID do SharePoint não mapeado no cache embutido para [{cleanHost}_{cleanSrv}]. Preservando registro para o próximo ciclo.");
                        return "Não";
                    }'''

sub_standard = '''// 3. APENAS COMO ÚLTIMO RECURSO: Baixa a lista completa se o ID ainda for desconhecido
                    if (string.IsNullOrEmpty(itemId))
                    {
                        var allItems = await GetAllListItemsAsync(client);
                        if (allItems == null)
                        {
                            FileLogger.Log($"[SharePointClient] ⚠️ Consulta de lista indisponível por Throttling do Microsoft Graph (HTTP 429). Preservando registro [{cleanHost}_{cleanSrv}] para o próximo ciclo.");
                            return "Não";
                        }

                        var matchingItems = new List<JsonElement>();
                        foreach (var item in allItems)
                        {
                            if (item.TryGetProperty("fields", out var fields))
                            {
                                string itemHost = fields.TryGetProperty("Hostname", out var h) ? h.GetString()?.Trim() ?? "" : "";
                                string itemSrv = fields.TryGetProperty("Nome_Servico", out var ns) ? ns.GetString()?.Trim() ?? "" : "";

                                if (itemHost.Equals(cleanHost, StringComparison.OrdinalIgnoreCase) &&
                                    itemSrv.Equals(cleanSrv, StringComparison.OrdinalIgnoreCase))
                                {
                                    matchingItems.Add(item);
                                }
                            }
                        }

                        if (matchingItems.Count > 0)
                        {
                            JsonElement selectedItem = matchingItems[0];
                            itemId = selectedItem.GetProperty("id").GetString() ?? "";
                            if (selectedItem.TryGetProperty("fields", out var selectedFields))
                            {
                                existingVersaoDesejada = selectedFields.TryGetProperty("Versao_Desejada", out var vd) ? vd.GetString() ?? "" : "";
                                existingStatusAtualizacao = selectedFields.TryGetProperty("Status_Atualizacao", out var sa) ? sa.GetString() ?? "" : "";
                                existingAcaoSolicitada = selectedFields.TryGetProperty("Acao_Solicitada", out var ac) ? ac.GetString() ?? "" : "";
                                existingUrlComunicacaoDesejavel = selectedFields.TryGetProperty("Url_Comunicacao_Desejavel", out var ud) ? ud.GetString() ?? "" : "";
                                existingAcaoSolicitadaUrl = selectedFields.TryGetProperty("Acao_Solicitada_Url", out var au) ? au.GetString() ?? "" : "";
                                existingAutoRestart = selectedFields.TryGetProperty("AutoRestart", out var ar) ? ar.GetString() ?? "" : "";
                            }
                            if (!string.IsNullOrEmpty(itemId))
                            {
                                SaveLocalServiceId(cacheKey, itemId);
                            }
                        }
                    }'''

if sub_safe in text:
    text = text.replace(sub_safe, sub_standard, 1)
    print("Step 3 restored with if (allItems == null)!")

with open(r'WinServiceFleetAgent\Core\SharePointClient.cs', 'w', encoding='utf-8') as f:
    f.write(text)

print("File saved!")
