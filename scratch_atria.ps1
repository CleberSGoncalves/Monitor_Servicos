###
### Run with:
### normal mode    ### Set-ExecutionPolicy Bypass -Scope Process -Force; iwr -UseBasicParsing'https://stgengineeringreleases.blob.core.windows.net/atriacapture/v2.0.0.0_x64_AVX2/install_v2000_x64.ps1' | iex
### download only  ### Set-ExecutionPolicy Bypass -Scope Process -Force; $f="$env:TEMP\install.ps1"; iwr -UseBasicParsing 'https://stgengineeringreleases.blob.core.windows.net/atriacapture/v2.0.0.0_x64_AVX2/install_v2000_x64.ps1' -OutFile $f; & $f /download
### install lav / skip ffdshow (without confirmation)           ### Set-ExecutionPolicy Bypass -Scope Process -Force; $f="$env:TEMP\install.ps1"; iwr -UseBasicParsing 'https://stgengineeringreleases.blob.core.windows.net/atriacapture/v2.0.0.0_x64_AVX2/install_v2000_x64.ps1' -OutFile $f; & $f /lav /noffdshow
### install lav/ffdshow/ytdlp/streamlink (without confirmation) ### Set-ExecutionPolicy Bypass -Scope Process -Force; $f="$env:TEMP\install.ps1"; iwr -UseBasicParsing 'https://stgengineeringreleases.blob.core.windows.net/atriacapture/v2.0.0.0_x64_AVX2/install_v2000_x64.ps1' -OutFile $f; & $f /lav /noffdshow /streamlink /ytdlp
### skip install (only 3rd party)                               ### Set-ExecutionPolicy Bypass -Scope Process -Force; $f="$env:TEMP\install.ps1"; iwr -UseBasicParsing 'https://stgengineeringreleases.blob.core.windows.net/atriacapture/v2.0.0.0_x64_AVX2/install_v2000_x64.ps1' -OutFile $f; & $f /noinstall /lav /noffdshow
### help           ### Set-ExecutionPolicy Bypass -Scope Process -Force; $f="$env:TEMP\install.ps1"; iwr -UseBasicParsing 'https://stgengineeringreleases.blob.core.windows.net/atriacapture/v2.0.0.0_x64_AVX2/install_v2000_x64.ps1' -OutFile $f; & $f /help
###
 
$downloadUrlDefault="https://stgengineeringreleases.blob.core.windows.net/atriacapture/v2.0.0.0_x64_AVX2/AtriaCapture_v2002_x64.zip"
$downloadUrlOldCpu="https://stgengineeringreleases.blob.core.windows.net/atriacapture/v2.0.0.0_x64_AVX2/AtriaCapture_v2002_x64_OnlyAVX.zip"
$downloadUrl=$downloadUrlDefault
$downloadFileName="AtriaCapture_v2002_x64.zip"
$downloadUrlFf="https://stgengineeringreleases.blob.core.windows.net/atriacapture/3rdParty/ffdshow_rev4530_20140209_clsid_x64.exe"
$downloadUrlLav="https://stgengineeringreleases.blob.core.windows.net/atriacapture/3rdParty/LAVFilters-0.81-Installer.exe"

$tempPath =[System.IO.Path]::GetTempPath()+"AtriaCapture_v2002_x64";
$CurrentDirectory = (Get-Location).Path

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

function GetInstallDirectory {
    param(
        [string]$InstallLocation,
        [bool]$PromptUser = $false
    )
    
    # 1. Try using the provided InstallLocation from registry
    if ($InstallLocation -and (Test-Path $InstallLocation)) {
        Write-Host "Found installation directory from registry: $InstallLocation" -ForegroundColor Green
        return $InstallLocation
    }
    
    # 2. Try common installation paths
    $commonPaths = @(
        "C:\DTV\DTVCapture",
        "C:\DTVCapture",
				"D:\MediaDNA_V2\Applications\DtvCapture",
				"D:\MediaDNA_V2\Applications\DtvCapture64"

    )
    
    foreach ($path in $commonPaths) {
        if (Test-Path $path) {
            Write-Host "Found installation directory at common path: $path" -ForegroundColor Green
            return $path
        }
    }
    
    # 3. Try to find DigitalTVCapture.exe in common locations
    Write-Host "Searching for DigitalTVCapture.exe..." -ForegroundColor Cyan
    $searchPaths = @("C:\DTV", "D:\MediaDNA_V2\Applications")
    
    foreach ($searchPath in $searchPaths) {
        if (Test-Path $searchPath) {
            $found = Get-ChildItem -Path $searchPath -Filter "DigitalTVCapture.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($found) {
                $installDir = $found.Directory.FullName
                Write-Host "Found installation directory by searching for DigitalTVCapture.exe: $installDir" -ForegroundColor Green
                return $installDir
            }
        }
    }
    
    # 4. Ask user if prompted
    if ($PromptUser) {
        Write-Host "Unable to automatically determine installation directory." -ForegroundColor Yellow
        $userPath = Read-Host "Please enter the Atria Capture installation directory (default: C:\DTV\DTVCapture)"
        if (-not $userPath) {
            $userPath = "C:\DTV\DTVCapture"
        }
        if (Test-Path $userPath) {
            Write-Host "Using user-provided installation directory: $userPath" -ForegroundColor Green
            return $userPath
        }
        else {
            Write-Host "The provided directory does not exist: $userPath" -ForegroundColor Red
        }
    }
    
    # 5. Not found
    return $null
}

function GetInstalledAtriaCaptureInfo {  
    $paths = @(  
        "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",  
        "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"  
    )  
  
    foreach ($path in $paths) {  
        $programs = Get-ItemProperty $path -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like "*Atria Capture*" }  
        foreach ($program in $programs) {  
            if ($program.DisplayVersion) {  
                # Return Version, InstallLocation, and UninstallString  
                return [PSCustomObject]@{  
                    Version         = $program.DisplayVersion  
                    UninstallString = $program.UninstallString  
                    InstallLocation = $program.InstallLocation
                }  
            }  
        }  
    }  
    # Not found  
    return [PSCustomObject]@{  
        Version         = ""  
        UninstallString = ""  
        InstallLocation = ""
    }  
}

function CreateAtriaCaptureBackup {
    $captureInstallDir = Read-Host "Confirm directory to backup: (default: C:\DTV\DTVCapture)"
    if (-not $captureInstallDir) {
        $captureInstallDir = "C:\DTV\DTVCapture"
    }
    # $outputZip = "$($captureInstallDir)\..\AtriaCapture-$((Get-Date).ToString("yyyy-MM-dd")).zip";
    #$outputZip = "$($captureInstallDir)\..\AtriaCapture-$((Get-Date).ToString("yyyy-MM-dd")).zip";
    $zipName = "AtriaCapture-$((Get-Date).ToString('yyyy-MM-dd')).zip"  
    $tempdir = [System.IO.Path]::GetTempPath()  
    $outputZip = Join-Path -Path $tempdir -ChildPath $zipName  

    try {

        Compress-Archive -Path $captureInstallDir -DestinationPath $outputZip -Force

        if (-not (Test-Path $outputZip)) {
            Write-Error "Unable to create Atria Capture backup"
            Throw "Unable to create Atria Capture backup"
        }

        Move-Item -Path $outputZip -Destination $captureInstallDir  
        Write-Host "Backup done in AtriaCaptureBkp-$((Get-Date).ToString("yyyy-MM-dd")).zip" -ForegroundColor Green

    }
    catch {
        <#Do this if a terminating exception happens#>
        Write-Error "Failed to create backup: $($_.Exception.Message)"
        Write-Error "Please create a backup manually before proceeding."
        Read-Host "Press Enter to continue..."
    }

}

function DownloadWithProgress {
    param(
        [string]$Url,
        [string]$Destination,
        [string]$ActivityName = "Downloading"
    )
    $webClient = New-Object System.Net.WebClient
    $fileName = [System.IO.Path]::GetFileName($Destination)
    Register-ObjectEvent -InputObject $webClient -EventName DownloadProgressChanged -Action {
        $pct = $Event.SourceEventArgs.ProgressPercentage
        $receivedMB = [math]::Round($Event.SourceEventArgs.BytesReceived / 1MB, 1)
        $totalMB = [math]::Round($Event.SourceEventArgs.TotalBytesToReceive / 1MB, 1)
        Write-Progress -Activity $Event.MessageData.Activity -Status "$receivedMB MB / $totalMB MB ($pct%)" -PercentComplete $pct
    } -MessageData @{ Activity = "$ActivityName - $fileName" } | Out-Null
    Register-ObjectEvent -InputObject $webClient -EventName DownloadFileCompleted -Action {
        Write-Progress -Activity $Event.MessageData.Activity -Completed
    } -MessageData @{ Activity = "$ActivityName - $fileName" } | Out-Null
    $webClient.DownloadFileAsync([Uri]$Url, $Destination)
    while ($webClient.IsBusy) { Start-Sleep -Milliseconds 100 }
    $webClient.Dispose()
    Get-EventSubscriber | Where-Object { $_.SourceObject -eq $webClient } | Unregister-Event -ErrorAction SilentlyContinue
}

function PromptYN([string]$Message) {
    do {
        $a = (Read-Host "$Message (Y/N)").Trim().ToUpper()
    } while ($a -notmatch '^(Y|N)')
    $a -eq 'Y'
}

function StopAtriaCapture() {
    
        $fma = Get-Service -Name FastMatchingSVC -ErrorAction SilentlyContinue
        if ($fma) {
            Write-Host "Stopping FastMatchingSVC service..." -ForegroundColor Cyan
            

            Write-Host "Configuring service to not take action on failure..."  -ForegroundColor Yellow
            sc.exe failure FastMatchingSVC reset= 0 actions= "" reboot= ""  
            
            Write-Host "Killing the process FastMatchingSVC.exe..."  -ForegroundColor Yellow
            taskkill /F /IM FastMatchingSVC.exe  
        } 
        $cleaner = Get-Service -Name FileCleaner -ErrorAction SilentlyContinue
        if ($cleaner) {
            Write-Host "Stopping FileCleaner service..." -ForegroundColor Cyan
            stop-service FileCleaner
        } 

        $processNames = @(  
            "DigitalTVCapture.exe",  
            "DigitalTVReceiver.exe"
        )  
        
        foreach ($procName in $processNames) {  
            $trimmedName = $procName.Trim()  
            $procNameNoExt = [System.IO.Path]::GetFileNameWithoutExtension($trimmedName)  
            Get-Process -Name $procNameNoExt -ErrorAction SilentlyContinue | ForEach-Object {  
                Write-Host "Stopping process: $($_.ProcessName) (Id: $($_.Id))"  
                Stop-Process -Id $_.Id -Force  
            }  
        }  

}

function UpdateLogRotateConfig {
    param(
        [string]$InstallDir
    )
    
    $logRotateConfPath = Join-Path -Path $InstallDir -ChildPath "FastMatchingSvc\LogRotate\LogRotate.Conf"
    
    if (-not (Test-Path $logRotateConfPath)) {
        Write-Host "LogRotate.Conf not found at $logRotateConfPath. Skipping configuration update." -ForegroundColor Yellow
        return
    }
    
    try {
        $content = Get-Content -Path $logRotateConfPath -Raw
        $correctLogPath = Join-Path -Path $InstallDir -ChildPath "FastMatchingSvc\fma.log"
        
        # Replace the hardcoded path with the correct one
        $updatedContent = $content -replace 'C:\\DTV\\DTVCapture\\FastMatchingSvc\\fma\.log', $correctLogPath.Replace('\', '\\')
        
        Set-Content -Path $logRotateConfPath -Value $updatedContent -Force
        Write-Host "LogRotate.Conf updated successfully with path: $correctLogPath" -ForegroundColor Green
        
        # Execute CreateSchedTask.bat from the installation directory
        $createSchedTaskPath = Join-Path -Path $InstallDir -ChildPath "FastMatchingSvc\LogRotate\CreateSchedTask.bat"
        
        if (Test-Path $createSchedTaskPath) {
            Write-Host "Executing CreateSchedTask.bat to configure scheduled task..." -ForegroundColor Cyan
            
            # Ensure InstallDir ends with backslash
            $installDirWithSlash = $InstallDir.TrimEnd('\') + '\'
            
            # Create a temporary PowerShell script to properly invoke the batch file
            $tempPsPath = Join-Path -Path $env:TEMP -ChildPath "RunCreateSchedTask.ps1"
            $psContent = @"
Set-Location -Path '$InstallDir'
& '$createSchedTaskPath' '$installDirWithSlash'
exit `$LASTEXITCODE
"@
            Set-Content -Path $tempPsPath -Value $psContent -Force
            
            $result = Start-Process -FilePath "powershell.exe" -ArgumentList "-ExecutionPolicy Bypass -File `"$tempPsPath`"" -Wait -PassThru -NoNewWindow
            
            # Clean up temp PowerShell script
            Remove-Item -Path $tempPsPath -Force -ErrorAction SilentlyContinue
            
            if ($result.ExitCode -eq 0) {
                Write-Host "Scheduled task created successfully." -ForegroundColor Green
            }
            else {
                Write-Host "Warning: CreateSchedTask.bat returned exit code $($result.ExitCode)." -ForegroundColor Yellow
            }
        }
        else {
            Write-Host "CreateSchedTask.bat not found at $createSchedTaskPath. Skipping scheduled task creation." -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "Failed to update LogRotate.Conf: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

function ReinstallFastMatchingService {
    param(
        [string]$InstallDir
    )
    
    if (-not $InstallDir) {
        Write-Host "Installation directory not provided. Skipping FastMatchingSVC service reinstallation." -ForegroundColor Yellow
        return
    }
    
    $fmaSvcPath = Join-Path -Path $InstallDir -ChildPath "FastMatchingSvc\FastMatchingSvc.exe"
    
    if (-not (Test-Path $fmaSvcPath)) {
        Write-Host "FastMatchingSvc.exe not found at $fmaSvcPath. Skipping service reinstallation." -ForegroundColor Yellow
        return
    }
    
    try {
        $fmaSvcDir = Split-Path -Path $fmaSvcPath -Parent
        
        # Uninstall the service
        Write-Host "Uninstalling FastMatchingSVC service..." -ForegroundColor Cyan
        $uninstallResult = Start-Process -FilePath $fmaSvcPath -ArgumentList "/uninstall" -WorkingDirectory $fmaSvcDir -Wait -PassThru -NoNewWindow
        
        if ($uninstallResult.ExitCode -eq 0) {
            Write-Host "FastMatchingSVC service uninstalled successfully." -ForegroundColor Green
        }
        else {
            Write-Host "Warning: FastMatchingSVC uninstall returned exit code $($uninstallResult.ExitCode)." -ForegroundColor Yellow
        }
        
        # Install the service
        Write-Host "Installing FastMatchingSVC service..." -ForegroundColor Cyan
        $installResult = Start-Process -FilePath $fmaSvcPath -ArgumentList "/install" -WorkingDirectory $fmaSvcDir -Wait -PassThru -NoNewWindow
        
        if ($installResult.ExitCode -eq 0) {
            Write-Host "FastMatchingSVC service installed successfully." -ForegroundColor Green
        }
        else {
            Write-Host "Warning: FastMatchingSVC install returned exit code $($installResult.ExitCode)." -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "Failed to reinstall FastMatchingSVC service: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

$showHelp = $false
$downloadOnly = $false
$skipInstall = $false
$useOldCpu = $false

$createBackup = $null

$installFfdshow = $null
$installLav = $null
$installStreamlink = $null
$installYtdlp = $null

if ($args) {
    if ($args | Where-Object { $_.Trim().ToLower() -eq '/help' }) {
        $showHelp = $true
    }
    if ($args | Where-Object { $_.Trim().ToLower() -eq '/download' }) {
        $downloadOnly = $true
    }
    if ($args | Where-Object { $_.Trim().ToLower() -eq '/noinstall' }) {
        $skipInstall = $true
    }
    if ($args | Where-Object { $_.Trim().ToLower() -eq '/oldcpu' }) {
        $useOldCpu = $true
    }
    if ($args | Where-Object { $_.Trim().ToLower() -eq '/backup' }) {
        $createBackup = $true
    }
    if ($args | Where-Object { $_.Trim().ToLower() -eq '/nobackup' }) {
        $createBackup = $false
    }
    if ($args | Where-Object { $_.Trim().ToLower() -eq '/ffdshow' }) {
        $installFfdshow = $true
    }
    if ($args | Where-Object { $_.Trim().ToLower() -eq '/noffdshow' }) {
        $installFfdshow = $false
    }
    if ($args | Where-Object { $_.Trim().ToLower() -eq '/lav' }) {
        $installLav = $true
    }
    if ($args | Where-Object { $_.Trim().ToLower() -eq '/nolav' }) {
        $installLav = $false
    }
    if ($args | Where-Object { $_.Trim().ToLower() -eq '/streamlink' }) {
        $installStreamlink = $true
    }
    if ($args | Where-Object { $_.Trim().ToLower() -eq '/nostreamlink' }) {
        $installStreamlink = $false
    }
    if ($args | Where-Object { $_.Trim().ToLower() -eq '/ytdlp' }) {
        $installYtdlp = $true
    }
    if ($args | Where-Object { $_.Trim().ToLower() -eq '/noytdlp' }) {
        $installYtdlp = $false
    }
}

if ($useOldCpu) {
    $downloadUrl = $downloadUrlOldCpu
    $downloadFileName = "AtriaCapture_v2002_x64_OnlyAVX.zip"
}

if ($showHelp) {
    Write-Host "Atria Capture installer script" -ForegroundColor Cyan
    Write-Host "Execute without parameters to proceed with automatic installation." 
    Write-Host "Parameters:" -ForegroundColor Cyan
    Write-Host "  /download      Downloads installers to the current directory and exits."
    Write-Host "  /noinstall     Skip Atria Capture installation (only install 3rd party components)."
    Write-Host "  /oldcpu        Downloads and installs the OnlyAVX package for CPUs without AVX2."
    Write-Host "  /backup        Create backup of existing installation without prompting."
    Write-Host "  /nobackup      Skip backup without prompting."
    Write-Host "  /help          Shows this help text and exits."
    Write-Host "  /ffdshow       Install ffDshow without prompting."
    Write-Host "  /noffdshow     Skip ffDshow without prompting."
    Write-Host "  /lav           Install LAV filters without prompting."
    Write-Host "  /nolav         Skip LAV filters without prompting."
    Write-Host "  /streamlink    Install StreamLink without prompting."
    Write-Host "  /nostreamlink  Skip StreamLink without prompting."
    Write-Host "  /ytdlp         Install yt-dlp without prompting."
    Write-Host "  /noytdlp       Skip yt-dlp without prompting."
    return
}

if ($downloadOnly) {
    try {
        $downloads = @(
            @{ Url = $downloadUrl; Name = $downloadFileName },
            @{ Url = $downloadUrlFf; Name = 'ffdshow_rev4530_20140209_clsid_x64.exe' },
            @{ Url = $downloadUrlLav; Name = 'LAVFilters-0.81-Installer.exe' }
        )

        Write-Host ">------------------ Download-only mode ------------------<" -ForegroundColor Cyan

        foreach ($item in $downloads) {
            $destination = Join-Path -Path $CurrentDirectory -ChildPath $item.Name
            Write-Host "Downloading $($item.Name) to $CurrentDirectory..."
            DownloadWithProgress -Url $item.Url -Destination $destination -ActivityName "Downloading"
            Write-Host "$($item.Name) downloaded." -ForegroundColor Green
        }

        Write-Host "Download-only mode completed successfully." -ForegroundColor Green
    }
    catch {
        Write-Error "Failed during download-only mode: $($_.Exception.Message)"
        exit 1
    }
    return
}

if (-not $isAdmin) {
    Write-Error "You are NOT running as Administrator."
	Throw "Run script as administrator!"
}

try 
{
		Write-Host ">---------------------- FIFTY5[ ]BLUE - Atria Capture Installer Script ----------------------<" -ForegroundColor Cyan

    if ($skipInstall) {
        Write-Host "Skipping Atria Capture installation (/noinstall)." -ForegroundColor Yellow
    } else {
        # Create temp directory if it doesn't exist
        if (-not (Test-Path $tempPath)) {
            New-Item -ItemType Directory -Path $tempPath -Force | Out-Null
            Write-Host "Created temporary directory: $tempPath" -ForegroundColor Cyan
        }

        Write-Host "Downloading Atria Capture v2.0.0.2 installer ..."

        DownloadWithProgress -Url $downloadUrl -Destination "$($tempPath)\setup.zip" -ActivityName "Downloading Atria Capture"
        Expand-Archive -Force "$($tempPath)\setup.zip" -DestinationPath "$($tempPath)\unzip"

        Write-Host "New version downloaded +OK!"  -ForegroundColor Green

        $version = GetInstalledAtriaCaptureInfo
        if ($version.Version) {
            Write-Host "Previous version of Atria Capture $($version.Version) detected." -ForegroundColor Yellow
            Write-Host "That version will be removed before installing the new one." -ForegroundColor Cyan

            $clse = PromptYN "All Atria Capture instances and their dependencies will be forcibly closed. Proceed?" -ForegroundColor Cyan
            if($clse) {
                StopAtriaCapture
            } else {
                Write-Host "Please stop the process manually and try again.." -ForegroundColor Red
                Exit(-1)
            }

            $bkp = if ($null -ne $createBackup) { $createBackup } else { PromptYN "Do you want to create a backup of existing setup?" }
            if ($bkp) {
                CreateAtriaCaptureBackup
            }

            if($version.UninstallString) {
                Write-Host "Uninstalling previous version of Atria Capture..." -ForegroundColor Cyan
                $uninstallPath = $version.UninstallString
                if (!$uninstallPath) {
                    Write-Error "Uninstall file not found at $uninstallPath"
                    Throw "Uninstall file not found at $uninstallPath"
                }
                Write-Host $uninstallPath

                $cmd, $args = $uninstallPath -split ' ', 2
                $args = $args -replace '/I', '/X' # to uninstall!!!

                Start-Process -FilePath $cmd -ArgumentList $args -Wait

            } else {
                Write-Host "Failed to remove the existing Atria Capture. Please proceed with manual uninstallation." -ForegroundColor Red
                Exit(-1);
            }
            Write-Host "Previous version uninstalled +OK!" -ForegroundColor Green
        }

        Write-Host "Ready to install Atria Capture v2.0.0.2..." -ForegroundColor Cyan


#        if ($($version.Version) -eq "v1.4.44") {
#            # Considerem que el VC++redist ja esta instal·lat i nomes cal executar el MSI.
#            Write-Host "Running DTVCaptureInstaller_x64.msi..." -ForegroundColor Cyan
#            Start-Process -FilePath "$($tempPath)\unzip\DTVCaptureInstaller_x64.msi" -Wait
#        } else {
            $setupPath = "$($tempPath)\unzip\setup.exe"
            if (-not (Test-Path $setupPath)) {
                Write-Error "Setup.exe file not found at $setupPath"
                Throw "Setup file not found at $setupPath"
            }
            Write-Host "Running setup.exe..." -ForegroundColor Cyan
            Start-Process -FilePath $setupPath -Wait
#        }
    }
	
	$ffd = if ($null -ne $installFfdshow) { $installFfdshow } else { PromptYN "Do you want to download and install the ffDshow filter? (recommended for LATAM)" }
	if ($ffd) {
		Write-Host "Downloading ffdshow_rev4530 installer ..."
		$setupPathFf="$($tempPath)\ffdshow_rev4530_20140209_clsid_x64.exe"
		DownloadWithProgress -Url $downloadUrlFf -Destination $setupPathFf -ActivityName "Downloading ffdshow"
		Write-Host "ffdshow downloaded +OK!"  -ForegroundColor Green
		$argsFf="/verysilent /NORESTART"
		Start-Process -FilePath $setupPathFf -ArgumentList $argsFf -Wait
    Write-Host "FFDSHOW installation completed successfully" -ForegroundColor Green
	}

	$lavd = if ($null -ne $installLav) { $installLav } else { PromptYN "Do you want to download and install the LAV filters package? (recommended Yes)" }
	if ($lavd) {
		Write-Host "Downloading LAVFilters-0.81-Installer.exe..."
		$setupPathLav="$($tempPath)\LAVFilters-0.81-Installer.exe"
		DownloadWithProgress -Url $downloadUrlLav -Destination $setupPathLav -ActivityName "Downloading LAV Filters"
		Write-Host "LAV installer downloaded +OK!"  -ForegroundColor Green
		$argsLav="/verysilent /norestart"
		Start-Process -FilePath $setupPathLav -ArgumentList $argsLav -Wait
    Write-Host "LAV installation completed successfully" -ForegroundColor Green
	}

	$streamlink = if ($null -ne $installStreamlink) { $installStreamlink } else { PromptYN "Do you want to install StreamLink?" }
	if ($streamlink) {
		Write-Host "Installing StreamLink via winget..." -ForegroundColor Cyan
		Start-Process -FilePath "winget" -ArgumentList "install streamlink" -Wait
	}

	$ytdlp = if ($null -ne $installYtdlp) { $installYtdlp } else { PromptYN "Do you want to install yt-dlp?" }
	if ($ytdlp) {
		Write-Host "Installing yt-dlp via winget..." -ForegroundColor Cyan
		Start-Process -FilePath "winget" -ArgumentList "install -e --id yt-dlp.yt-dlp" -Wait
	}
	
  if (-not $skipInstall) {
      Write-Host "Configuring LogRotate for FMA..." -ForegroundColor Cyan

      # Get the actual installation directory and update LogRotate.Conf
      $installedInfo = GetInstalledAtriaCaptureInfo
      if ($installedInfo.Version) {
          $installDir = GetInstallDirectory $installedInfo.InstallLocation -PromptUser $true

          if ($installDir) {
              UpdateLogRotateConfig $installDir

              Write-Host "Reinstalling FastMatchingSVC service..." -ForegroundColor Cyan
              ReinstallFastMatchingService $installDir
          }
          else {
              Write-Host "Unable to determine installation directory. Skipping LogRotate configuration." -ForegroundColor Yellow
              Write-Host "Please manually update the LogRotate.Conf file if needed." -ForegroundColor Yellow
          }
      }
      else {
          Write-Host "Atria Capture installation not found in registry. Skipping LogRotate configuration." -ForegroundColor Yellow
      }
  }

	Write-Host "Installation complete!"  -ForegroundColor Green
}
catch {
 
    Write-Host "ERROR during script execution." -ForegroundColor Red
    Write-Host "Please report the following information to KMSP_Engineering@kantar.com:" -ForegroundColor Yellow
    Write-Error $_.ScriptStackTrace
}

Set-Location -Path $CurrentDirectory


