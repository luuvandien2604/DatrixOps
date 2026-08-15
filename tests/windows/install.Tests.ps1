Describe "DatrixOps Agent Installer" {
    Context "Argument Validation" {
        It "Throws when missing required parameters" {
            { & "$PSScriptRoot/../../frontend/public/install.ps1" } | Should -Throw
        }
        It "Throws when layout is invalid" {
            { & "$PSScriptRoot/../../frontend/public/install.ps1" -Token "t" -ServerUrl "http://localhost:8080" -AgentVersion "1.0.0" -AgentArtifactBaseUrl "http://localhost:8080" -AgentReleaseLayout "invalid_layout" } | Should -Throw
        }
    }
}
