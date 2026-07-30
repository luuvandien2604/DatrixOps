package update

import (
	"strings"
	"testing"
	"time"
)

func TestArtifactValidateAcceptsPortableFilename(t *testing.T) {
	artifact := Artifact{
		OS:     "linux",
		Arch:   "amd64",
		URL:    "datrixops-agent-linux-amd64",
		SHA256: strings.Repeat("a", 64),
		Size:   1024,
	}
	if err := artifact.Validate(); err != nil {
		t.Fatalf("expected portable artifact filename to be valid: %v", err)
	}
}

func TestArtifactValidateRejectsRelativeTraversal(t *testing.T) {
	artifact := Artifact{
		OS:     "linux",
		Arch:   "amd64",
		URL:    "../datrixops-agent-linux-amd64",
		SHA256: strings.Repeat("a", 64),
		Size:   1024,
	}
	if err := artifact.Validate(); err == nil {
		t.Fatal("expected relative traversal to be rejected")
	}
}

func TestManifestValidateRejectsInsecureAbsoluteArtifactURL(t *testing.T) {
	manifest := Manifest{
		SchemaVersion: SupportedManifestSchemaVersion,
		Version:       "1.0.0",
		PublishedAt:   time.Now(),
		Artifacts: []Artifact{{
			OS:     "linux",
			Arch:   "amd64",
			URL:    "http://example.com/agent",
			SHA256: strings.Repeat("a", 64),
			Size:   1024,
		}},
	}
	if err := manifest.Validate(); err == nil {
		t.Fatal("expected insecure absolute artifact URL to be rejected")
	}
}
