#####################################
# Tagify Installer for Windows
# Version: 1.0
#####################################

# Strict error handling
$ErrorActionPreference = "Stop"

#####################################
# Configuration
#####################################

$REPO_OWNER = "alexk218"
$REPO_NAME = "tagify"
$LOG_DIR = "$env:TEMP\tagify-installer"
$LOG_FILE = "$LOG_DIR\install.log"
$USER_LOG = ""  # Will be set after user detection
$INSTALLATION_FAILED = $false
$TAGIFY_TEMP_DIR = ""

#####################################
# Utility Functions
#####################################

function Initialize-Logging {
    if (-not (Test-Path $LOG_DIR)) {
        New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null
    }
    
    "==========================================" | Out-File -FilePath $LOG_FILE -Encoding UTF8
    "Tagify Installer Log" | Out-File -FilePath $LOG_FILE -Append -Encoding UTF8
    "Date: $(Get-Date)" | Out-File -FilePath $LOG_FILE -Append -Encoding UTF8
    "==========================================" | Out-File -FilePath $LOG_FILE -Append -Encoding UTF8
}

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Write-Host $logMessage
    $logMessage | Out-File -FilePath $LOG_FILE -Append -Encoding UTF8
}

function Write-ErrorAndExit {
    param([string]$Message)
    
    $script:INSTALLATION_FAILED = $true
    Write-Log "❌ ERROR: $Message"
    Write-Log "=========================================="
    Write-Log "Installation failed! See error above."
    Write-Log "=========================================="
    
    Show-Notification "Installation Failed" "Error: $Message"
    
    Finalize-Log 1
    exit 1
}

function Show-Notification {
    param(
        [string]$Title,
        [string]$Message
    )
    
    try {
        Add-Type -AssemblyName System.Windows.Forms
        $notification = New-Object System.Windows.Forms.NotifyIcon
        $notification.Icon = [System.Drawing.SystemIcons]::Information
        $notification.BalloonTipTitle = $Title
        $notification.BalloonTipText = $Message
        $notification.Visible = $true
        $notification.ShowBalloonTip(3000)
        Start-Sleep -Seconds 1
        $notification.Dispose()
    }
    catch {
        Write-Log "⚠ Could not show notification: $_"
    }
}

function Finalize-Log {
    param([int]$ExitCode = 0)
    
    Write-Log "Finalizing log file..."
    
    # Copy log to Desktop
    $desktopPath = [Environment]::GetFolderPath("Desktop")
    $script:USER_LOG = Join-Path $desktopPath "tagify-install.log"
    
    try {
        Copy-Item -Path $LOG_FILE -Destination $USER_LOG -Force
        Write-Log "✓ Log file saved to: $USER_LOG"
        
        if ($ExitCode -eq 0 -and -not $script:INSTALLATION_FAILED) {
            "" | Out-File -FilePath $USER_LOG -Append -Encoding UTF8
            "Installation completed successfully." | Out-File -FilePath $USER_LOG -Append -Encoding UTF8
        }
        else {
            "" | Out-File -FilePath $USER_LOG -Append -Encoding UTF8
            "Installation FAILED. See errors above." | Out-File -FilePath $USER_LOG -Append -Encoding UTF8
        }
    }
    catch {
        Write-Log "⚠ Could not copy log to Desktop: $_"
        $script:USER_LOG = $LOG_FILE
    }
}

function Cleanup-TempFiles {
    Write-Log "Cleaning up temporary files..."
    Remove-Item -Path "$env:TEMP\tagify-download-*" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "$env:TEMP\spicetify-install-*" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Log "✓ Cleanup complete"
}

function Cleanup-OnExit {
    $exitCode = $LASTEXITCODE
    if ($null -eq $exitCode) { $exitCode = 0 }
    
    Cleanup-TempFiles
    Finalize-Log $exitCode
    
    if ($exitCode -ne 0 -or $script:INSTALLATION_FAILED) {
        Write-Log "=========================================="
        Write-Log "❌ Installation failed!"
        Write-Log "Log file location: $script:USER_LOG"
        Write-Log "=========================================="
    }
}

function Test-Prerequisites {
    Write-Log "Checking prerequisites..."
    
    # Check PowerShell version
    if ($PSVersionTable.PSVersion.Major -lt 5) {
        Write-ErrorAndExit "PowerShell 5.0 or higher is required"
    }
    Write-Log "✓ PowerShell version OK"
    
    # Check internet connectivity
    Write-Log "Checking internet connection..."
    try {
        $response = Invoke-WebRequest -Uri "https://api.github.com" -UseBasicParsing -TimeoutSec 5
        Write-Log "✓ Internet connection OK"
    }
    catch {
        Write-ErrorAndExit "No internet connection. Please connect to the internet and try again."
    }
}

function Install-Spicetify {
    Write-Log "Checking Spicetify installation..."
    
    $spicetifyPath = Join-Path $env:USERPROFILE ".spicetify\spicetify.exe"
    
    # Check if already installed
    if (Test-Path $spicetifyPath) {
        try {
            $version = & $spicetifyPath -v 2>$null
            Write-Log "✓ Spicetify already installed (version: $version)"
            return
        }
        catch {
            Write-Log "⚠ Spicetify found but version check failed"
        }
    }
    
    Write-Log "Installing Spicetify..."
    Show-Notification "Tagify Installer" "Installing Spicetify..."
    
    try {
        # Create temporary script file
        $tempScript = Join-Path $env:TEMP "spicetify-install-$PID.ps1"
        
        # Download the installer script
        Write-Log "Downloading Spicetify installer..."
        Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/spicetify/cli/main/install.ps1' -OutFile $tempScript -UseBasicParsing
        
        # Execute with "n" piped to skip marketplace prompt
        Write-Log "Running Spicetify installer..."
        $winPS = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"

        if (-not (Test-Path $winPS)) {
            Write-ErrorAndExit "Windows PowerShell executable not found at expected location: $winPS"
        }

        $output = "n" | & $winPS -ExecutionPolicy Bypass -File $tempScript 2>&1

        # Log the output to our main log file
        $output | ForEach-Object { Write-Log "SPICETIFY: $_" }
        
        # Clean up temp script
        Remove-Item $tempScript -Force -ErrorAction SilentlyContinue
        
        Write-Log "✓ Spicetify installer completed"
    }
    catch {
        Write-ErrorAndExit "Spicetify installation failed: $_"
    }
    
    # Reload environment variables
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "User") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    
    # Wait for file system to settle
    Start-Sleep -Seconds 2
    
    # Verify installation with detailed logging
    Write-Log "Verifying Spicetify installation..."
    Write-Log "Expected path: $spicetifyPath"
    
    if (-not (Test-Path $spicetifyPath)) {
        # Try alternative common locations
        $altPath1 = Join-Path $env:LOCALAPPDATA "spicetify\spicetify.exe"
        $altPath2 = Join-Path $env:APPDATA "spicetify\spicetify.exe"
        
        Write-Log "Not found at expected location, checking alternatives..."
        Write-Log "Checking: $altPath1"
        Write-Log "Checking: $altPath2"
        
        if (Test-Path $altPath1) {
            $spicetifyPath = $altPath1
            Write-Log "✓ Found Spicetify at: $spicetifyPath"
        }
        elseif (Test-Path $altPath2) {
            $spicetifyPath = $altPath2
            Write-Log "✓ Found Spicetify at: $spicetifyPath"
        }
        else {
            # List what's actually in the .spicetify directory for debugging
            $spicetifyDir = Join-Path $env:USERPROFILE ".spicetify"
            if (Test-Path $spicetifyDir) {
                Write-Log "Contents of ${spicetifyDir}:"
                Get-ChildItem $spicetifyDir -ErrorAction SilentlyContinue | ForEach-Object {
                    Write-Log "  - $($_.Name)"
                }
            }
            else {
                Write-Log "Spicetify directory doesn't exist: $spicetifyDir"
            }
            
            Write-ErrorAndExit "Spicetify binary not found at any expected location"
        }
    }
    
    # Final verification - test if it actually works
    try {
        $version = & $spicetifyPath -v 2>$null
        Write-Log "✓ Spicetify verified (version: $version)"
    }
    catch {
        Write-ErrorAndExit "Spicetify installed but cannot execute properly: $_"
    }
}

function Get-LatestTagifyRelease {
    Write-Log "Downloading Tagify..."
    Show-Notification "Tagify Installer" "Downloading Tagify..."
    
    $apiUrl = "https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/releases/latest"
    $script:TAGIFY_TEMP_DIR = Join-Path $env:TEMP "tagify-download-$PID"
    
    New-Item -ItemType Directory -Path $TAGIFY_TEMP_DIR -Force | Out-Null
    
    # Get latest release info
    Write-Log "Fetching release information from GitHub..."
    try {
        $releaseInfo = Invoke-RestMethod -Uri $apiUrl -ErrorAction Stop
        $releaseVersion = $releaseInfo.tag_name
        
        # Find the main zip file (exclude source code archives)
        $mainAsset = $releaseInfo.assets | Where-Object { 
            $_.name -like "tagify*.zip" -and $_.name -notlike "*source*" 
        } | Select-Object -First 1
        
        if ($mainAsset) {
            $downloadUrl = $mainAsset.browser_download_url
            Write-Log "Found Tagify $releaseVersion"
        }
        else {
            throw "No suitable zip file found in release"
        }
    }
    catch {
        Write-Log "⚠ Could not fetch release info, using fallback URL"
        $downloadUrl = "https://github.com/$REPO_OWNER/$REPO_NAME/releases/latest/download/tagify.zip"
        $releaseVersion = "latest"
    }
    
    Write-Log "Download URL: $downloadUrl"
    
    # Download
    $zipPath = Join-Path $TAGIFY_TEMP_DIR "tagify.zip"
    Write-Log "Downloading from GitHub..."
    
    try {
        $webClient = New-Object System.Net.WebClient
        $webClient.DownloadFile($downloadUrl, $zipPath)
    }
    catch {
        Remove-Item -Path $TAGIFY_TEMP_DIR -Recurse -Force -ErrorAction SilentlyContinue
        Write-ErrorAndExit "Failed to download Tagify: $_"
    }
    
    # Verify download
    if (-not (Test-Path $zipPath) -or (Get-Item $zipPath).Length -eq 0) {
        Remove-Item -Path $TAGIFY_TEMP_DIR -Recurse -Force -ErrorAction SilentlyContinue
        Write-ErrorAndExit "Downloaded file is missing or empty"
    }
    
    $fileSize = (Get-Item $zipPath).Length / 1MB
    Write-Log "✓ Downloaded tagify.zip ($($fileSize.ToString('0.00')) MB)"
    
    # Extract
    Write-Log "Extracting archive..."
    try {
        Expand-Archive -Path $zipPath -DestinationPath $TAGIFY_TEMP_DIR -Force
        Remove-Item $zipPath -Force
        Write-Log "✓ Archive extracted"
    }
    catch {
        Remove-Item -Path $TAGIFY_TEMP_DIR -Recurse -Force -ErrorAction SilentlyContinue
        Write-ErrorAndExit "Failed to extract Tagify archive: $_"
    }
}

function Install-Tagify {
    Write-Log "Installing Tagify..."
    Show-Notification "Tagify Installer" "Installing Tagify..."
    
    # Download Tagify (sets TAGIFY_TEMP_DIR)
    Get-LatestTagifyRelease
    
    $customAppsDir = Join-Path $env:USERPROFILE "AppData\Roaming\spicetify\CustomApps"
    $tagifyDir = Join-Path $customAppsDir "tagify"
    
    # Create CustomApps directory
    Write-Log "Creating CustomApps directory..."
    New-Item -ItemType Directory -Path $customAppsDir -Force | Out-Null
    
    # Remove old installation
    if (Test-Path $tagifyDir) {
        Write-Log "Removing previous Tagify installation..."
        Remove-Item -Path $tagifyDir -Recurse -Force
    }
    
    # Debug: show temp directory contents
    Write-Log "Contents of temp directory:"
    Get-ChildItem $TAGIFY_TEMP_DIR | ForEach-Object { Write-Log "  $($_.Name)" }
    
    # Find extracted folder
    $extractedFolder = Get-ChildItem $TAGIFY_TEMP_DIR -Directory | Where-Object { $_.Name -eq "tagify" } | Select-Object -First 1
    
    Write-Log "Moving Tagify to CustomApps..."
    
    if ($extractedFolder) {
        Write-Log "Moving from: $($extractedFolder.FullName)"
        Write-Log "Moving to: $tagifyDir"
        Move-Item -Path $extractedFolder.FullName -Destination $tagifyDir -Force
    }
    else {
        # Try any directory (excluding __MACOSX)
        $extractedFolder = Get-ChildItem $TAGIFY_TEMP_DIR -Directory | Where-Object { $_.Name -ne "__MACOSX" } | Select-Object -First 1
        
        if ($extractedFolder) {
            Write-Log "Found alternate folder: $($extractedFolder.Name)"
            Move-Item -Path $extractedFolder.FullName -Destination $tagifyDir -Force
        }
        else {
            # Check for files directly in temp dir
            $files = Get-ChildItem $TAGIFY_TEMP_DIR -File -Recurse | Where-Object { $_.FullName -notlike "*__MACOSX*" }
            
            if ($files.Count -gt 0) {
                Write-Log "Files found in temp dir: $($files.Count)"
                New-Item -ItemType Directory -Path $tagifyDir -Force | Out-Null
                Copy-Item -Path "$TAGIFY_TEMP_DIR\*" -Destination $tagifyDir -Recurse -Force
            }
            else {
                Remove-Item -Path $TAGIFY_TEMP_DIR -Recurse -Force -ErrorAction SilentlyContinue
                Write-ErrorAndExit "No files found in downloaded archive"
            }
        }
    }
    
    # Cleanup temp files
    Remove-Item -Path $TAGIFY_TEMP_DIR -Recurse -Force -ErrorAction SilentlyContinue
    
    # Verify installation
    if (-not (Test-Path $tagifyDir)) {
        Write-ErrorAndExit "Tagify directory not found after installation"
    }
    
    $installedFileCount = (Get-ChildItem $tagifyDir -File -Recurse).Count
    Write-Log "Files installed: $installedFileCount"
    
    if ($installedFileCount -eq 0) {
        Write-ErrorAndExit "Tagify directory is empty after installation"
    }
    
    Write-Log "✓ Tagify files installed to: $tagifyDir"
    
    # Show what was installed
    Write-Log "Installed files:"
    Get-ChildItem $tagifyDir | ForEach-Object { Write-Log "  $($_.Name)" }
}

function Set-SpicetifyConfiguration {
    Write-Log "Configuring Spicetify..."
    Show-Notification "Tagify Installer" "Configuring Spicetify..."

    $spicetifyExe = Get-SpicetifyPath
    $configFile = Join-Path $env:USERPROFILE "AppData\Roaming\spicetify\config-xpui.ini"

    # Add Tagify if not present
    if (Test-Path $configFile) {
        $configContent = Get-Content $configFile -Raw
        if ($configContent -notmatch "custom_apps.*tagify") {
            & $spicetifyExe config custom_apps tagify
            Write-Log "✓ Tagify added to config"
        }
        else {
            Write-Log "✓ Tagify already in config, skipping"
        }
    }
    else {
        & $spicetifyExe config custom_apps tagify
        Write-Log "✓ Tagify added to config"
    }

    # Explicit Spotify path
    & $spicetifyExe config spotify_path "$env:LOCALAPPDATA\Spotify"
    Write-Log "✓ Spotify path configured"

    # Clear previous backups
    & $spicetifyExe backup clear
    Write-Log "✓ Backup cleared"

    # Wait for filesystem
    Start-Sleep -Seconds 1

    # Apply in a new process
    Write-Log "Applying Spicetify configuration..."
    try {
        Start-Process -FilePath $spicetifyExe -ArgumentList "backup apply" -Wait -NoNewWindow
        Write-Log "✓ Spicetify configuration applied successfully"
    }
    catch {
        Write-ErrorAndExit "Failed to apply Spicetify configuration in new process: $_"
    }

    Write-Log "✓ Configuration completed"
}


function Test-Installation {
    Write-Log "Verifying installation..."
    
    $tagifyDir = Join-Path $env:USERPROFILE "AppData\Roaming\spicetify\CustomApps\tagify"
    $configFile = Join-Path $env:USERPROFILE "AppData\Roaming\spicetify\config-xpui.ini"
    
    # Check Tagify directory
    if (-not (Test-Path $tagifyDir)) {
        Write-ErrorAndExit "Verification failed: Tagify directory not found"
    }
    Write-Log "✓ Tagify directory exists"
    
    # Check config file
    if (Test-Path $configFile) {
        $configContent = Get-Content $configFile -Raw
        if ($configContent -match "tagify") {
            Write-Log "✓ Tagify found in Spicetify config"
        }
        else {
            Write-Log "⚠ Warning: Tagify not found in config file"
        }
    }
    else {
        Write-Log "⚠ Warning: Spicetify config file not found"
    }
    
    Write-Log "✓ Installation verified"
}

function Stop-SpotifyProcess {
    Write-Log "Checking if Spotify is running..."
    
    $spotifyProcesses = Get-Process -Name "Spotify" -ErrorAction SilentlyContinue
    
    if ($spotifyProcesses) {
        Write-Log "Spotify is running - terminating it..."
        Show-Notification "Tagify Installer" "Closing Spotify..."
        
        # Kill gracefully
        $spotifyProcesses | Stop-Process -Force
        
        # Wait for termination
        $count = 0
        while ((Get-Process -Name "Spotify" -ErrorAction SilentlyContinue) -and $count -lt 10) {
            Start-Sleep -Milliseconds 500
            $count++
        }
        
        Write-Log "✓ Spotify terminated"
    }
    else {
        Write-Log "✓ Spotify is not running"
    }
}

function Get-SpicetifyPath {
    $paths = @(
        Join-Path $env:USERPROFILE ".spicetify\spicetify.exe"
        Join-Path $env:LOCALAPPDATA "spicetify\spicetify.exe"
        Join-Path $env:APPDATA "spicetify\spicetify.exe"
    )

    foreach ($p in $paths) {
        if (Test-Path $p) {
            return $p
        }
    }

    throw "Spicetify executable not found in expected locations."
}


#####################################
# Main Installation Flow
#####################################

function Main {
    Initialize-Logging
    Write-Log "Starting Tagify installation..."
    
    Show-Notification "Tagify Installer" "Installation starting..."
    
    try {
        Test-Prerequisites
        Install-Spicetify
        Stop-SpotifyProcess
        Set-SpicetifyConfiguration
        Install-Tagify
        Test-Installation
        
        # Apply Spicetify one final time in a new process
        $spicetifyExe = Get-SpicetifyPath
        Write-Log "Applying Spicetify configuration..."
        try {
            Start-Process -FilePath $spicetifyExe -ArgumentList "backup apply" -Wait -NoNewWindow
            Write-Log "✓ Spicetify backup applied successfully"

            Start-Process -FilePath $spicetifyExe -ArgumentList "apply" -Wait -NoNewWindow
            Write-Log "✓ Spicetify applied successfully"
        }
        catch {
            Write-ErrorAndExit "Failed to apply Spicetify configuration: $_"
        }

        
        Write-Log "=========================================="
        Write-Log "✅ Installation completed successfully!"
        Write-Log "=========================================="
        
        Show-Notification "Tagify Installed" "Installation complete! Please restart Spotify."
        Finalize-Log 0
    }
    catch {
        Write-Log "❌ Installation failed: $_"
        Finalize-Log 1
    }
    finally {
        Cleanup-TempFiles
    }
}

# Run main installation
Main