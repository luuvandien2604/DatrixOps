Describe "DatrixOps Agent Updater" {
    Context "Argument Validation" {
        It "Throws when missing required parameters" {
            { & "$PSScriptRoot/../../frontend/public/update-agent.ps1" } | Should -Throw
        }

        It "Throws when target version format is invalid" {
            { & "$PSScriptRoot/../../frontend/public/update-agent.ps1" -TargetVersion "invalid" -TargetArtifactBaseUrl "http://127.0.0.1:8080" } | Should -Throw
        }
    }

    Context "Update and Rollback Behavior" {
        BeforeAll {
            $script:updaterScript = "$PSScriptRoot/../../frontend/public/update-agent.ps1"
            $script:root = if ($env:DATRIXOPS_INSTALLER_ROOT) { $env:DATRIXOPS_INSTALLER_ROOT } else { "$env:TEMP\datrixops_test" }
            $script:installDir = [System.IO.Path]::Combine($script:root, "Program Files", "DatrixOps")
            $script:binaryPath = "$script:installDir\datrixops-agent.exe"
            $script:backupPath = "$script:installDir\datrixops-agent.bak"
            $script:wrapperPath = "$script:installDir\run_agent.bat"
        }

        BeforeEach {
            # Reset environment variables
            $env:DATRIXOPS_MOCK_RESTART_FAIL = $null
            $env:DATRIXOPS_MOCK_HEALTH_FAIL = $null
            $env:DATRIXOPS_MOCK_ROLLBACK_RESTART_FAIL = $null
            $env:DATRIXOPS_MOCK_ROLLBACK_HEALTH_FAIL = $null

            # Clean mock state files and old fixtures
            Remove-Item -Path "$script:root\mock_schtasks_state*" -Force -ErrorAction SilentlyContinue
            Remove-Item -Path "$script:installDir\*" -Force -Recurse -ErrorAction SilentlyContinue

            if (-not (Test-Path $script:installDir)) {
                New-Item -ItemType Directory -Force -Path $script:installDir | Out-Null
            }

            # Setup baseline v1.0.0 installation fixture
            Set-Content -Path $script:binaryPath -Value "OLD_BINARY_1.0.0"
            $initialWrapper = @(
                '@echo off',
                'set "AGENT_VERSION=1.0.0"',
                'set "DATRIXOPS_AGENT_ARTIFACT_BASE_URL=http://127.0.0.1:8080"',
                '"%~dp0datrixops-agent.exe"'
            )
            Set-Content -Path $script:wrapperPath -Value $initialWrapper
        }

        AfterEach {
            $env:DATRIXOPS_MOCK_RESTART_FAIL = $null
            $env:DATRIXOPS_MOCK_HEALTH_FAIL = $null
            $env:DATRIXOPS_MOCK_ROLLBACK_RESTART_FAIL = $null
            $env:DATRIXOPS_MOCK_ROLLBACK_HEALTH_FAIL = $null
            Remove-Item -Path "$script:root\mock_schtasks_state*" -Force -ErrorAction SilentlyContinue
        }

        It "Successfully upgrades from 1.0.0 to 1.0.1 and persists new version" {
            { & $script:updaterScript -TargetVersion "1.0.1" -TargetArtifactBaseUrl "http://127.0.0.1:8080" } | Should -Not -Throw

            # Active binary must now contain the downloaded new content
            (Test-Path $script:binaryPath) | Should -Be $true
            $activeContent = [System.IO.File]::ReadAllText($script:binaryPath)
            $activeContent | Should -Not -Be "OLD_BINARY_1.0.0"

            # Wrapper version must be updated to 1.0.1
            $wrapperContent = Get-Content $script:wrapperPath -Raw
            $wrapperContent | Should -Match 'set "AGENT_VERSION=1.0.1"'

            # Backup binary must be cleaned up
            (Test-Path $script:backupPath) | Should -Be $false
        }

        It "Restores old binary and retains 1.0.0 state on new start failure" {
            $env:DATRIXOPS_MOCK_RESTART_FAIL = "1"

            { & $script:updaterScript -TargetVersion "1.0.1" -TargetArtifactBaseUrl "http://127.0.0.1:8080" } | Should -Throw

            # Active binary must be restored to old content
            (Test-Path $script:binaryPath) | Should -Be $true
            $activeContent = [System.IO.File]::ReadAllText($script:binaryPath)
            $activeContent.Trim() | Should -Be "OLD_BINARY_1.0.0"

            # Wrapper version must retain 1.0.0
            $wrapperContent = Get-Content $script:wrapperPath -Raw
            $wrapperContent | Should -Match 'set "AGENT_VERSION=1.0.0"'

            # Backup binary must be cleaned up
            (Test-Path $script:backupPath) | Should -Be $false
        }

        It "Restores old binary and retains 1.0.0 state on new health failure" {
            $env:DATRIXOPS_MOCK_HEALTH_FAIL = "1"

            { & $script:updaterScript -TargetVersion "1.0.1" -TargetArtifactBaseUrl "http://127.0.0.1:8080" } | Should -Throw

            # Active binary must be restored to old content
            (Test-Path $script:binaryPath) | Should -Be $true
            $activeContent = [System.IO.File]::ReadAllText($script:binaryPath)
            $activeContent.Trim() | Should -Be "OLD_BINARY_1.0.0"

            # Wrapper version must retain 1.0.0
            $wrapperContent = Get-Content $script:wrapperPath -Raw
            $wrapperContent | Should -Match 'set "AGENT_VERSION=1.0.0"'

            # Backup binary must be cleaned up
            (Test-Path $script:backupPath) | Should -Be $false
        }

        It "Fails with critical error when rollback start fails" {
            $env:DATRIXOPS_MOCK_HEALTH_FAIL = "1"
            $env:DATRIXOPS_MOCK_ROLLBACK_RESTART_FAIL = "1"

            { & $script:updaterScript -TargetVersion "1.0.1" -TargetArtifactBaseUrl "http://127.0.0.1:8080" } | Should -Throw

            # Active binary was restored from backup before rollback restart failed
            (Test-Path $script:binaryPath) | Should -Be $true
            $activeContent = [System.IO.File]::ReadAllText($script:binaryPath)
            $activeContent.Trim() | Should -Be "OLD_BINARY_1.0.0"

            # Wrapper version must retain 1.0.0
            $wrapperContent = Get-Content $script:wrapperPath -Raw
            $wrapperContent | Should -Match 'set "AGENT_VERSION=1.0.0"'
        }

        It "Fails with critical error when rollback health fails" {
            $env:DATRIXOPS_MOCK_HEALTH_FAIL = "1"
            $env:DATRIXOPS_MOCK_ROLLBACK_HEALTH_FAIL = "1"

            { & $script:updaterScript -TargetVersion "1.0.1" -TargetArtifactBaseUrl "http://127.0.0.1:8080" } | Should -Throw

            # Active binary was restored from backup before rollback health failed
            (Test-Path $script:binaryPath) | Should -Be $true
            $activeContent = [System.IO.File]::ReadAllText($script:binaryPath)
            $activeContent.Trim() | Should -Be "OLD_BINARY_1.0.0"

            # Wrapper version must retain 1.0.0
            $wrapperContent = Get-Content $script:wrapperPath -Raw
            $wrapperContent | Should -Match 'set "AGENT_VERSION=1.0.0"'
        }
    }
}
