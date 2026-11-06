with open(r'WinServiceFleetAgent\Scripts\bootstrap_update.ps1', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Fix variable reference with colon
text = text.replace('ID do agente para $hostName: $agentItemId', 'ID do agente para $($hostName): $agentItemId')
text = text.replace('ID do agente obtido da Central ($hostName): $agentItemId', 'ID do agente obtido da Central ($($hostName)): $agentItemId')

# 2. Fix the extra closing brace at line 751
# Let's inspect where the extra brace is
sub_brace = '''            if ($patchRes) {
                Write-Host "[SUCESSO] Registro no SharePoint atualizado para v$targetVer (Status: Atualizado)!" -ForegroundColor Green
            }
        }
    }
} catch {'''

# In case of whitespace/formatting
if sub_brace not in text:
    # Let's find "Registro no SharePoint atualizado para"
    pos = text.find('Registro no SharePoint atualizado para')
    if pos != -1:
        pos_catch = text.find('} catch {', pos)
        if pos_catch != -1:
            segment = text[pos:pos_catch+9]
            print("Current segment around catch:")
            print(repr(segment))
            # The structure should be:
            # if ($patchRes) { ... }
            # } (closes if ($agentItemId...))
            # } catch { (closes try {)
            # So after if ($patchRes) { ... }, there should be ONE closing brace for if ($agentItemId), then } catch {
            fixed_segment = segment.replace('        }\n\n    }\n\n} catch {', '        }\n    }\n} catch {')
            fixed_segment = fixed_segment.replace('        }\r\n\r\n    }\r\n\r\n} catch {', '        }\r\n    }\r\n} catch {')
            # If there was an extra brace:
            # Let's count open vs closed braces between try and catch
            # Actually let's locate the try block
            pos_try = text.find('try {\n    $idsResp = Invoke-RestMethod')
            if pos_try == -1:
                pos_try = text.find('try {\r\n    $idsResp = Invoke-RestMethod')
            if pos_try == -1:
                pos_try = text.rfind('try {', 0, pos)
            
            try_catch_block = text[pos_try:pos_catch]
            open_count = try_catch_block.count('{')
            close_count = try_catch_block.count('}')
            print(f"Braces in try block: {open_count} open, {close_count} close")
            # If close_count == open_count, then } catch { has no opening try because close_count already closed it!
            # For } catch { to match try {, close_count inside try_catch_block must be open_count - 1!
            if close_count >= open_count:
                excess = close_count - open_count + 1
                print(f"Removing {excess} excess closing brace(s)...")
                # Remove the last excess closing braces right before } catch {
                pos_last_brace = text.rfind('}', 0, pos_catch)
                text = text[:pos_last_brace] + text[pos_last_brace+1:]
else:
    text = text.replace(sub_brace, '''            if ($patchRes) {
                Write-Host "[SUCESSO] Registro no SharePoint atualizado para v$targetVer (Status: Atualizado)!" -ForegroundColor Green
            }
        }
} catch {''', 1)

with open(r'WinServiceFleetAgent\Scripts\bootstrap_update.ps1', 'w', encoding='utf-8') as f:
    f.write(text)

print("Saved patch!")
