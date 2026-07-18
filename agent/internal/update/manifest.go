package update

import (
	"fmt"
	"strings"
	"time"
)

const SupportedManifestSchemaVersion = 1

type Manifest struct {
	SchemaVersion int        `json:"schema_version"`
	Version       string     `json:"version"`
	PublishedAt   time.Time  `json:"published_at"`
	Artifacts     []Artifact `json:"artifacts"`
}

type Artifact struct {
	OS     string `json:"os"`
	Arch   string `json:"arch"`
	URL    string `json:"url"`
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
}

func (m Manifest) Validate() error {
	if m.SchemaVersion != SupportedManifestSchemaVersion {
		return fmt.Errorf(
			"unsupported manifest schema version: %d",
			m.SchemaVersion,
		)
	}

	if strings.TrimSpace(m.Version) == "" {
		return fmt.Errorf("manifest version is required")
	}

	if m.PublishedAt.IsZero() {
		return fmt.Errorf("manifest published_at is required")
	}

	if len(m.Artifacts) == 0 {
		return fmt.Errorf("manifest must contain at least one artifact")
	}

	for index, artifact := range m.Artifacts {
		if err := artifact.Validate(); err != nil {
			return fmt.Errorf("artifact %d: %w", index, err)
		}
	}

	return nil
}

func (a Artifact) Validate() error {
	if strings.TrimSpace(a.OS) == "" {
		return fmt.Errorf("OS is required")
	}

	if strings.TrimSpace(a.Arch) == "" {
		return fmt.Errorf("architecture is required")
	}

	if strings.TrimSpace(a.URL) == "" {
		return fmt.Errorf("URL is required")
	}

	if len(strings.TrimSpace(a.SHA256)) != 64 {
		return fmt.Errorf(
			"SHA-256 must contain 64 hexadecimal characters",
		)
	}

	if a.Size <= 0 {
		return fmt.Errorf("artifact size must be greater than zero")
	}

	return nil
}

func (m Manifest) ArtifactFor(goos, goarch string) (Artifact, error) {
	for _, artifact := range m.Artifacts {
		if artifact.OS == goos &&
			artifact.Arch == goarch {
			return artifact, nil
		}
	}

	return Artifact{}, fmt.Errorf(
		"no artifact found for %s/%s",
		goos,
		goarch,
	)
}