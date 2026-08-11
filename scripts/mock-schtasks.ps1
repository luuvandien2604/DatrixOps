param(
    [string]$Command,
    [string]$TaskName
)

$StateFile = if ($env:DATRIXOPS_INSTALLER_ROOT) { "$env:DATRIXOPS_INSTALLER_ROOT\mock_schtasks_state" } else { "$env:TEMP\mock_schtasks_state" }

if ($Command -eq "stop") {
    Write-Host "Mock schtasks: stop succeeded"
    exit 0
} elseif ($Command -eq "start") {
    $countFile = "${StateFile}_start_count"
    $count = 0
    if (Test-Path $countFile) { $count = [int](Get-Content $countFile) }
    $count++
    $count | Set-Content $countFile

    if ($count -eq 1) {
        if ($env:DATRIXOPS_MOCK_RESTART_FAIL) {
            Write-Error "Mock start failed"
            exit 1
        }
        Write-Host "Mock start succeeded"
        exit 0
    } else {
        if ($env:DATRIXOPS_MOCK_ROLLBACK_RESTART_FAIL) {
            Write-Error "Mock rollback start failed"
            exit 1
        }
        Write-Host "Mock rollback start succeeded"
        exit 0
    }
} elseif ($Command -eq "status") {
    $countFile = "${StateFile}_health_count"
    $count = 0
    if (Test-Path $countFile) { $count = [int](Get-Content $countFile) }
    $count++
    $count | Set-Content $countFile

    if ($count -eq 1) {
        if ($env:DATRIXOPS_MOCK_HEALTH_FAIL) {
            Write-Output "stopped"
            exit 0
        }
        Write-Output "running"
        exit 0
    } else {
        if ($env:DATRIXOPS_MOCK_ROLLBACK_HEALTH_FAIL) {
            Write-Output "stopped"
            exit 0
        }
        Write-Output "running"
        exit 0
    }
}

Write-Error "Mock schtasks: unknown command $Command"
exit 1
