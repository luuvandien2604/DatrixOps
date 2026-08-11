package update

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

// Supported release layout modes:
//
//   - LayoutGitHub ("github"):         <release_base>/v<version>/  (e.g. .../v1.5.5/)
//   - LayoutDefault ("default"):       <release_base>/<version>/   (e.g. .../1.5.5/)
//   - LayoutLegacyDirect ("legacy_direct"): <release_base>/       (when base URL already includes version path)
const (
	LayoutGitHub       = "github"
	LayoutDefault      = "default"
	LayoutLegacyDirect = "legacy_direct"
)

var versionRegex = regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+$`)

// ParseLayout normalises a raw layout string. Returns an error for unknown layouts.
func ParseLayout(raw string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "", LayoutDefault:
		return LayoutDefault, nil
	case LayoutGitHub:
		return LayoutGitHub, nil
	case LayoutLegacyDirect:
		return LayoutLegacyDirect, nil
	default:
		return "", fmt.Errorf("unsupported release layout %q (must be %q, %q, or %q)", raw, LayoutGitHub, LayoutDefault, LayoutLegacyDirect)
	}
}

// VersionDir returns the version directory component for a given layout.
func VersionDir(layout, version string) (string, error) {
	if !versionRegex.MatchString(strings.TrimSpace(version)) {
		return "", fmt.Errorf("invalid semver version format %q (must match X.Y.Z)", version)
	}
	validLayout, err := ParseLayout(layout)
	if err != nil {
		return "", err
	}
	switch validLayout {
	case LayoutGitHub:
		return "v" + strings.TrimSpace(version), nil
	case LayoutDefault:
		return strings.TrimSpace(version), nil
	case LayoutLegacyDirect:
		return "", nil
	default:
		return "", fmt.Errorf("unsupported layout %q", layout)
	}
}

// ArtifactBaseURL constructs the full artifact directory URL for a specific version.
func ArtifactBaseURL(releaseBaseURL, layout, version string) (string, error) {
	base := strings.TrimRight(strings.TrimSpace(releaseBaseURL), "/")
	if base == "" {
		return "", fmt.Errorf("releaseBaseURL must not be empty")
	}
	vDir, err := VersionDir(layout, version)
	if err != nil {
		return "", err
	}
	if vDir == "" {
		return base, nil
	}
	return url.JoinPath(base, vDir)
}

// ManifestURL returns the full URL of the release manifest.
func ManifestURL(releaseBaseURL, layout, version string) (string, error) {
	artBase, err := ArtifactBaseURL(releaseBaseURL, layout, version)
	if err != nil {
		return "", fmt.Errorf("construct manifest URL: %w", err)
	}
	return url.JoinPath(artBase, "manifest.json")
}

// SignatureURL returns the full URL of the manifest signature.
func SignatureURL(releaseBaseURL, layout, version string) (string, error) {
	artBase, err := ArtifactBaseURL(releaseBaseURL, layout, version)
	if err != nil {
		return "", fmt.Errorf("construct signature URL: %w", err)
	}
	return url.JoinPath(artBase, "manifest.sig")
}

// ArtifactURL resolves an artifact URL. If artifactPath is absolute, it returns artifactPath.
// Otherwise resolves it relative to the version artifact base URL.
func ArtifactURL(releaseBaseURL, layout, version, artifactPath string) (string, error) {
	artifactPath = strings.TrimSpace(artifactPath)
	if artifactPath == "" {
		return "", fmt.Errorf("artifact path must not be empty")
	}
	parsed, err := url.Parse(artifactPath)
	if err != nil {
		return "", fmt.Errorf("parse artifact path: %w", err)
	}
	if parsed.IsAbs() {
		return artifactPath, nil
	}
	artBase, err := ArtifactBaseURL(releaseBaseURL, layout, version)
	if err != nil {
		return "", fmt.Errorf("construct artifact URL: %w", err)
	}
	return url.JoinPath(artBase, artifactPath)
}
