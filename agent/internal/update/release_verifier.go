package update

import (
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
)

type ReleaseTarget struct {
	OS       string
	Arch     string
	Filename string
}

var RequiredReleaseTargets = []ReleaseTarget{
	{OS: "linux", Arch: "amd64", Filename: "datrixops-agent-linux-amd64"},
	{OS: "linux", Arch: "arm64", Filename: "datrixops-agent-linux-arm64"},
	{OS: "darwin", Arch: "amd64", Filename: "datrixops-agent-darwin-amd64"},
	{OS: "darwin", Arch: "arm64", Filename: "datrixops-agent-darwin-arm64"},
	{OS: "windows", Arch: "amd64", Filename: "datrixops-agent-windows-amd64.exe"},
}

// VerifyReleaseDirectory verifies the signed manifest before trusting any of
// its fields, then verifies every required release artifact on disk.
func VerifyReleaseDirectory(releaseDir, expectedVersion string, publicKey ed25519.PublicKey) (*Manifest, error) {
	if strings.TrimSpace(expectedVersion) == "" {
		return nil, fmt.Errorf("expected version is required")
	}
	if len(publicKey) != ed25519.PublicKeySize {
		return nil, fmt.Errorf("invalid release public key length: %d", len(publicKey))
	}

	manifestBytes, err := readRegularFile(filepath.Join(releaseDir, "manifest.json"), maxManifestSize)
	if err != nil {
		return nil, fmt.Errorf("read release manifest: %w", err)
	}
	signature, err := readRegularFile(filepath.Join(releaseDir, "manifest.sig"), ed25519.SignatureSize)
	if err != nil {
		return nil, fmt.Errorf("read release signature: %w", err)
	}
	if len(signature) != ed25519.SignatureSize || !ed25519.Verify(publicKey, manifestBytes, signature) {
		return nil, fmt.Errorf("manifest signature verification failed")
	}

	var manifest Manifest
	decoder := json.NewDecoder(bytes.NewReader(manifestBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&manifest); err != nil {
		return nil, fmt.Errorf("decode signed release manifest: %w", err)
	}
	if err := ensureJSONEOF(decoder); err != nil {
		return nil, err
	}
	if err := manifest.Validate(); err != nil {
		return nil, fmt.Errorf("validate signed release manifest: %w", err)
	}
	if manifest.Version != expectedVersion {
		return nil, fmt.Errorf("manifest version %q does not match expected version %q", manifest.Version, expectedVersion)
	}

	required := make(map[string]ReleaseTarget, len(RequiredReleaseTargets))
	for _, target := range RequiredReleaseTargets {
		required[target.OS+"/"+target.Arch] = target
	}
	seen := make(map[string]bool, len(required))
	for _, artifact := range manifest.Artifacts {
		key := artifact.OS + "/" + artifact.Arch
		target, ok := required[key]
		if !ok {
			return nil, fmt.Errorf("unexpected artifact target %s", key)
		}
		if seen[key] {
			return nil, fmt.Errorf("duplicate artifact target %s", key)
		}
		filename, err := artifactFilename(artifact.URL)
		if err != nil {
			return nil, fmt.Errorf("artifact %s: %w", key, err)
		}
		if filename != target.Filename {
			return nil, fmt.Errorf("artifact %s uses filename %q, expected %q", key, filename, target.Filename)
		}
		if err := verifyArtifactFile(filepath.Join(releaseDir, filename), artifact); err != nil {
			return nil, fmt.Errorf("artifact %s: %w", key, err)
		}
		seen[key] = true
	}
	for key := range required {
		if !seen[key] {
			return nil, fmt.Errorf("required artifact target is missing: %s", key)
		}
	}
	return &manifest, nil
}

func ensureJSONEOF(decoder *json.Decoder) error {
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return fmt.Errorf("signed release manifest contains trailing JSON")
		}
		return fmt.Errorf("decode signed release manifest trailing data: %w", err)
	}
	return nil
}

func artifactFilename(rawURL string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		return "", fmt.Errorf("parse URL: %w", err)
	}
	filename := path.Base(parsed.Path)
	if filename == "." || filename == "/" || filename == "" {
		return "", fmt.Errorf("URL has no artifact filename")
	}
	return filename, nil
}

func verifyArtifactFile(filename string, artifact Artifact) error {
	content, err := readRegularFile(filename, artifact.Size)
	if err != nil {
		return err
	}
	if int64(len(content)) != artifact.Size {
		return fmt.Errorf("size mismatch: got %d, expected %d", len(content), artifact.Size)
	}
	expectedHash, err := hex.DecodeString(strings.ToLower(artifact.SHA256))
	if err != nil || len(expectedHash) != sha256.Size {
		return fmt.Errorf("invalid SHA-256 value")
	}
	actual := sha256.Sum256(content)
	if !bytes.Equal(actual[:], expectedHash) {
		return fmt.Errorf("SHA-256 mismatch")
	}
	return nil
}

func readRegularFile(filename string, maxSize int64) ([]byte, error) {
	info, err := os.Lstat(filename)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() {
		return nil, fmt.Errorf("not a regular file: %s", filename)
	}
	if info.Size() <= 0 || info.Size() > maxSize {
		return nil, fmt.Errorf("invalid file size %d for %s", info.Size(), filename)
	}
	return os.ReadFile(filename)
}
