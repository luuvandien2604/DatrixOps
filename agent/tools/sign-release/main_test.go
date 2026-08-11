package main

import (
	"testing"

	"github.com/luuvandien2604/DatrixOps/agent/internal/update"
)

func TestBuildArtifactURLViaSharedHelper(t *testing.T) {
	tests := []struct {
		name     string
		baseURL  string
		layout   string
		version  string
		filename string
		expected string
	}{
		{
			name:     "default layout appends version",
			baseURL:  "https://releases.example/agent",
			layout:   update.LayoutDefault,
			version:  "1.5.5",
			filename: "datrixops-agent-linux-amd64",
			expected: "https://releases.example/agent/1.5.5/datrixops-agent-linux-amd64",
		},
		{
			name:     "github layout prepends v",
			baseURL:  "https://github.com/example/DatrixOps/releases/download",
			layout:   update.LayoutGitHub,
			version:  "1.5.5",
			filename: "datrixops-agent-linux-amd64",
			expected: "https://github.com/example/DatrixOps/releases/download/v1.5.5/datrixops-agent-linux-amd64",
		},
		{
			name:     "legacy_direct uses base directly",
			baseURL:  "https://github.com/example/DatrixOps/releases/download/v1.5.5",
			layout:   update.LayoutLegacyDirect,
			version:  "1.5.5",
			filename: "datrixops-agent-linux-amd64",
			expected: "https://github.com/example/DatrixOps/releases/download/v1.5.5/datrixops-agent-linux-amd64",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			actual, err := update.ArtifactURL(test.baseURL, test.layout, test.version, test.filename)
			if err != nil {
				t.Fatal(err)
			}
			if actual != test.expected {
				t.Fatalf("artifact URL = %q, expected %q", actual, test.expected)
			}
		})
	}
}

func TestOptionalBooleanEnvRejectsInvalidValue(t *testing.T) {
	t.Setenv("AGENT_RELEASE_BASE_URL_INCLUDES_VERSION", "sometimes")
	if _, err := optionalBooleanEnv("AGENT_RELEASE_BASE_URL_INCLUDES_VERSION"); err == nil {
		t.Fatal("expected invalid boolean environment value to fail")
	}
}

func TestValidateVersionStrictSemver(t *testing.T) {
	valid := []string{"1.0.0", "1.5.5", "10.20.30"}
	for _, v := range valid {
		if err := validateVersion(v); err != nil {
			t.Fatalf("expected %q to be valid: %v", v, err)
		}
	}
	invalid := []string{"", "v1.5.5", "1.5", "1.5.5-rc1", "1.5.5.1", "abc"}
	for _, v := range invalid {
		if err := validateVersion(v); err == nil {
			t.Fatalf("expected %q to be invalid", v)
		}
	}
}
