param([Parameter(Mandatory=$true)][string]$Plan)
$ErrorActionPreference = 'Stop'
$planData = Get-Content -LiteralPath $Plan -Raw -Encoding UTF8 | ConvertFrom-Json
$work = $planData.work
$backup = Join-Path $work 'previous'
$moved = [System.Collections.Generic.List[string]]::new()
$installed = [System.Collections.Generic.List[string]]::new()
$newProcess = $null
Start-Transcript -Path (Join-Path $work 'install.log') -Force | Out-Null
function Move-Retry([string]$Source, [string]$Destination) {
  for ($attempt=0; $attempt -lt 30; $attempt++) {
    try { Move-Item -LiteralPath $Source -Destination $Destination -ErrorAction Stop; return }
    catch { if ($attempt -eq 29) { throw }; Start-Sleep -Seconds 1 }
  }
}
function Save-Failure([string]$Message) {
  [IO.File]::WriteAllText($planData.result, $Message, [Text.UTF8Encoding]::new($false))
}
try {
  # Keep the Process object so a reused PID cannot target a different process.
  $oldProcess = Get-Process -Id $planData.pid -ErrorAction SilentlyContinue
  New-Item -ItemType File -Path (Join-Path $work 'helper-ready') | Out-Null
  if ($oldProcess -and -not $oldProcess.WaitForExit(120000)) {
    Save-Failure 'The previous app did not exit; the update was not installed.'
    exit 1
  }
  New-Item -ItemType Directory -Path $backup | Out-Null
  foreach ($name in $planData.entries) {
    $old = Join-Path $planData.target $name
    if (Test-Path -LiteralPath $old) {
      Move-Retry $old (Join-Path $backup $name)
      $moved.Add($name)
    }
  }
  foreach ($name in $planData.entries) {
    $source = Join-Path $planData.stage $name
    if (Test-Path -LiteralPath $source) {
      Move-Retry $source (Join-Path $planData.target $name)
      $installed.Add($name)
    }
  }
  $newProcess = Start-Process -FilePath (Join-Path $planData.target 'LanYue.exe') -WorkingDirectory $planData.target -ArgumentList "--lanyue-update=$($planData.token)" -PassThru
  for ($i=0; $i -lt 90; $i++) {
    if (Test-Path -LiteralPath (Join-Path $work 'ack')) {
      Stop-Transcript | Out-Null
      Remove-Item -LiteralPath $work -Recurse -Force
      exit 0
    }
    if ($newProcess.HasExited) { break }
    Start-Sleep -Seconds 1
  }
  throw 'The updated app did not report a successful startup.'
} catch {
  $reason = $_.Exception.Message
  if ($newProcess -and -not $newProcess.HasExited) {
    & "$env:SystemRoot\System32\taskkill.exe" /pid $newProcess.Id /T /F | Out-Null
    $newProcess.WaitForExit(10000) | Out-Null
  }
  try {
    foreach ($name in $installed) {
      Move-Retry (Join-Path $planData.target $name) (Join-Path $planData.stage $name)
    }
    foreach ($name in $moved) {
      Move-Retry (Join-Path $backup $name) (Join-Path $planData.target $name)
    }
    Save-Failure "Update failed; the previous version was restored. $reason"
    Start-Process -FilePath (Join-Path $planData.target 'LanYue.exe') -WorkingDirectory $planData.target
  } catch {
    Save-Failure "Update recovery needs attention. Previous files are in: $backup. $reason"
  }
  Stop-Transcript | Out-Null
  exit 1
}
