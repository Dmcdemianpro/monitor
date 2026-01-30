param(
  [Parameter(Mandatory = $true)]
  [int]$NodeId,
  [string]$ApiUrl = "http://localhost:4000",
  [string]$AgentKey = $env:MONID_AGENT_KEY,
  [int]$IntervalSec = 60,
  [switch]$Once
)

if (-not $AgentKey) {
  Write-Host "Missing AgentKey. Set -AgentKey or MONID_AGENT_KEY."
  exit 1
}

function Get-Metrics {
  $cpu = Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average
  $cpuPct = if ($null -ne $cpu.Average) { [math]::Round([double]$cpu.Average, 2) } else { $null }

  $os = Get-CimInstance Win32_OperatingSystem
  $memTotal = [double]$os.TotalVisibleMemorySize
  $memFree = [double]$os.FreePhysicalMemory
  $memPct = if ($memTotal -gt 0) { [math]::Round((($memTotal - $memFree) / $memTotal) * 100, 2) } else { $null }

  $disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3"
  $diskPct = $null
  if ($disks) {
    $usedList = @()
    foreach ($disk in $disks) {
      if ($disk.Size -gt 0) {
        $usedList += ((($disk.Size - $disk.FreeSpace) / $disk.Size) * 100)
      }
    }
    if ($usedList.Count -gt 0) {
      $diskPct = [math]::Round(($usedList | Measure-Object -Maximum).Maximum, 2)
    }
  }

  $top = Get-Process |
    Sort-Object -Property CPU -Descending |
    Select-Object -First 5 |
    ForEach-Object {
      @{
        name = $_.ProcessName
        cpu = if ($_.CPU -ne $null) { [math]::Round($_.CPU, 2) } else { $null }
        wsMb = [math]::Round($_.WorkingSet64 / 1MB, 1)
      }
    }

  return @{
    nodeId = $NodeId
    cpuPct = $cpuPct
    memPct = $memPct
    diskPct = $diskPct
    loadAvg = $null
    processes = $top
  }
}

function Send-Metrics {
  $payload = Get-Metrics | ConvertTo-Json -Depth 4
  try {
    Invoke-RestMethod `
      -Uri "$ApiUrl/api/agent/metrics" `
      -Method Post `
      -Headers @{ "X-Agent-Key" = $AgentKey } `
      -ContentType "application/json" `
      -Body $payload | Out-Null
    Write-Host "$(Get-Date -Format s) sent metrics for node $NodeId"
  } catch {
    Write-Host "$(Get-Date -Format s) failed to send metrics: $($_.Exception.Message)"
  }
}

do {
  Send-Metrics
  if (-not $Once) {
    Start-Sleep -Seconds $IntervalSec
  }
} while (-not $Once)
