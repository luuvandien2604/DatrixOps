Describe "DatrixOps Agent Updater" {
    Context "Argument Validation" {
        It "Throws when missing required parameters" {
            { & "$PSScriptRoot/../update-agent.ps1" } | Should -Throw
        }
    }
}
