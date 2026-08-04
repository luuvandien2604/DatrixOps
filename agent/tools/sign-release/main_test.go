package main

import "testing"

func TestBuildArtifactURL(t *testing.T) {
	tests := []struct {
		name                string
		baseURL             string
		baseIncludesVersion bool
		expected            string
	}{
		{
			name:     "version appended to release root",
			baseURL:  "https://releases.example/agent",
			expected: "https://releases.example/agent/1.5.5/datrixops-agent-linux-amd64",
		},
		{
			name:                "GitHub tag URL already includes version",
			baseURL:             "https://github.com/example/DatrixOps/releases/download/v1.5.5",
			baseIncludesVersion: true,
			expected:            "https://github.com/example/DatrixOps/releases/download/v1.5.5/datrixops-agent-linux-amd64",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			actual, err := buildArtifactURL(test.baseURL, "1.5.5", "datrixops-agent-linux-amd64", test.baseIncludesVersion)
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
