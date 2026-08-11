Describe "DatrixOps Agent Updater" {
    Context "Argument Validation" {
        It "Throws when missing required parameters" {
            { & "$PSScriptRoot/../update-agent.ps1" } | Should -Throw
        }
    }

    Context "Update Scenarios" {
        BeforeAll {
            $script = "$PSScriptRoot/../update-agent.ps1"
            $root = if ($env:DATRIXOPS_INSTALLER_ROOT) { $env:DATRIXOPS_INSTALLER_ROOT } else { "$env:TEMP\datrixops_test" }
            $installDir = [System.IO.Path]::Combine($root, "Program Files", "DatrixOps")
            if (-not (Test-Path $installDir)) { New-Item -ItemType Directory -Force -Path $installDir | Out-Null }
            $binaryPath = "$installDir\datrixops-agent.exe"
            Set-Content -Path $binaryPath -Value "dummy binary"
        }

        It "Succeeds on valid update" {
            Remove-Item -Path "$env:DATRIXOPS_INSTALLER_ROOT\mock_schtasks_state*" -Force -ErrorAction SilentlyContinue
            { & $script -TargetVersion "1.0.0" -TargetArtifactBaseUrl "http://127.0.0.1:8080" } | Should -Not -Throw
        }

        It "Rolls back on restart failure" {
            Remove-Item -Path "$env:DATRIXOPS_INSTALLER_ROOT\mock_schtasks_state*" -Force -ErrorAction SilentlyContinue
            $env:DATRIXOPS_MOCK_RESTART_FAIL = "1"
            { & $script -TargetVersion "1.0.0" -TargetArtifactBaseUrl "http://127.0.0.1:8080" } | Should -Throw
            $env:DATRIXOPS_MOCK_RESTART_FAIL = $null
        }

        It "Rolls back on health failure" {
            Remove-Item -Path "$env:DATRIXOPS_INSTALLER_ROOT\mock_schtasks_state*" -Force -ErrorAction SilentlyContinue
            $env:DATRIXOPS_MOCK_HEALTH_FAIL = "1"
            { & $script -TargetVersion "1.0.0" -TargetArtifactBaseUrl "http://127.0.0.1:8080" } | Should -Throw
            $env:DATRIXOPS_MOCK_HEALTH_FAIL = $null
        }

        It "Throws critical error if rollback start fails" {
            Remove-Item -Path "$env:DATRIXOPS_INSTALLER_ROOT\mock_schtasks_state*" -Force -ErrorAction SilentlyContinue
            $env:DATRIXOPS_MOCK_HEALTH_FAIL = "1"
            $env:DATRIXOPS_MOCK_ROLLBACK_RESTART_FAIL = "1"
            { & $script -TargetVersion "1.0.0" -TargetArtifactBaseUrl "http://127.0.0.1:8080" } | Should -Throw
            $env:DATRIXOPS_MOCK_HEALTH_FAIL = $null
            $env:DATRIXOPS_MOCK_ROLLBACK_RESTART_FAIL = $null
        }

        It "Throws critical error if rollback health fails" {
            Remove-Item -Path "$env:DATRIXOPS_INSTALLER_ROOT\mock_schtasks_state*" -Force -ErrorAction SilentlyContinue
            $env:DATRIXOPS_MOCK_HEALTH_FAIL = "1"
            $env:DATRIXOPS_MOCK_ROLLBACK_HEALTH_FAIL = "1"
            { & $script -TargetVersion "1.0.0" -TargetArtifactBaseUrl "http://127.0.0.1:8080" } | Should -Throw
            $env:DATRIXOPS_MOCK_HEALTH_FAIL = $null
            $env:DATRIXOPS_MOCK_ROLLBACK_HEALTH_FAIL = $null
        }
    }
}
