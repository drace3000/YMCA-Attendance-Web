$ErrorActionPreference = "Stop"

# Configuration
$containerName = "supabase_db_YMCA-Attendance-Web-2"
$dbUser = "postgres"
$dbName = "postgres"

# Timestamp for filename
$ts = Get-Date -Format "yyyyMMdd_HHmmss"

# Paths - save to local backups directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$backupsDir = Join-Path $projectRoot "backups"
$backupFileName = "dev_backup_$ts.backup"
$hostPath = Join-Path $backupsDir $backupFileName
$containerPath = "/tmp/$backupFileName"

# Ensure destination exists
Write-Host "Ensuring backups directory exists: $backupsDir"
New-Item -ItemType Directory -Force -Path $backupsDir | Out-Null

# Verify container is running
Write-Host "Checking if container '$containerName' is running..."
$containerExists = docker ps --filter "name=$containerName" --format "{{.Names}}" | Select-String -Pattern $containerName
if (-not $containerExists) {
    Write-Error "Container '$containerName' is not running. Please start Supabase with 'supabase start' first."
    exit 1
}

Write-Host "`n=== Creating Full Database Backup ===" -ForegroundColor Cyan
Write-Host "Container: $containerName"
Write-Host "Database: $dbName"
Write-Host "Backup file: $backupFileName"
Write-Host "Destination: $hostPath"
Write-Host ""

# Create backup in container using pg_dump with custom format
# -Fc = custom format (compressed, allows selective restore)
# --verbose = show progress
# --no-owner = don't output commands to set ownership
# --no-acl = don't output access privilege commands
Write-Host "Creating backup in container: $containerPath" -ForegroundColor Yellow
$dumpResult = docker exec $containerName pg_dump `
    -U $dbUser `
    -d $dbName `
    -Fc `
    --verbose `
    --no-owner `
    --no-acl `
    -f $containerPath

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to create backup in container. Exit code: $LASTEXITCODE"
    exit 1
}

# Copy backup from container to host
Write-Host "`nCopying backup to host: $hostPath" -ForegroundColor Yellow
docker cp "${containerName}:${containerPath}" $hostPath

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to copy backup from container. Exit code: $LASTEXITCODE"
    # Try to clean up container file
    docker exec $containerName rm -f $containerPath 2>$null
    exit 1
}

# Verify backup file exists and has content
if (-not (Test-Path $hostPath)) {
    Write-Error "Backup file was not created at: $hostPath"
    exit 1
}

$fileSize = (Get-Item $hostPath).Length
if ($fileSize -eq 0) {
    Write-Error "Backup file is empty!"
    Remove-Item $hostPath -Force
    exit 1
}

# Clean up temp file in container
Write-Host "Cleaning up temp file in container..." -ForegroundColor Yellow
docker exec $containerName rm -f $containerPath 2>$null

# Display backup info
Write-Host "`n=== Backup Complete ===" -ForegroundColor Green
Write-Host "File: $hostPath" -ForegroundColor White
Write-Host "Size: $([math]::Round($fileSize / 1MB, 2)) MB" -ForegroundColor White
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor White
Write-Host ""

# List recent backups
Write-Host "Recent backups:" -ForegroundColor Cyan
Get-ChildItem -Path $backupsDir -Filter "dev_backup_*.backup" | 
    Sort-Object LastWriteTime -Descending | 
    Select-Object -First 5 | 
    ForEach-Object {
        $sizeMB = [math]::Round($_.Length / 1MB, 2)
        Write-Host "  $($_.Name) - $sizeMB MB - $($_.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor Gray
    }

Write-Host "`nTo restore this backup, use:" -ForegroundColor Yellow
Write-Host "  docker exec -i $containerName pg_restore -U $dbUser -d $dbName --clean --if-exists < backup_file.backup" -ForegroundColor Gray
Write-Host ""
