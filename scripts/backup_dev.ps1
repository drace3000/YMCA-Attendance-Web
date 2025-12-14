$ErrorActionPreference = "Stop"

# Timestamp for filename
$ts = Get-Date -Format "yyyyMMdd_HHmmss"

# Paths
$dest = "F:\Projects\Cursor\YMCA\Backups\Supabase"
$containerPath = "/tmp/dev_backup_$ts.backup"
$hostPath = Join-Path $dest ("dev_backup_{0}.backup" -f $ts)

# Ensure destination exists
New-Item -ItemType Directory -Force -Path $dest | Out-Null

Write-Host "Creating backup in container: $containerPath"
docker exec supabase_db_YMCA-Attendance-Web pg_dump -U postgres -d postgres -Fc -f $containerPath

Write-Host "Copying backup to host: $hostPath"
docker cp "supabase_db_YMCA-Attendance-Web:$containerPath" $hostPath

Write-Host "Cleaning up temp file in container"
docker exec supabase_db_YMCA-Attendance-Web rm $containerPath

Write-Host "Backup complete: $hostPath"






