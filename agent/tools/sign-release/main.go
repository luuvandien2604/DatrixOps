package main

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/luuvandien2604/DatrixOps/agent/internal/update"
)

type buildTarget struct {
	OS       string
	Arch     string
	Filename string
}

var targets = []buildTarget{
	{
		OS:       "linux",
		Arch:     "amd64",
		Filename: "datrixops-agent-linux-amd64",
	},
	{
		OS:       "linux",
		Arch:     "arm64",
		Filename: "datrixops-agent-linux-arm64",
	},
	{
		OS:       "darwin",
		Arch:     "amd64",
		Filename: "datrixops-agent-darwin-amd64",
	},
	{
		OS:       "darwin",
		Arch:     "arm64",
		Filename: "datrixops-agent-darwin-arm64",
	},
	{
		OS:       "windows",
		Arch:     "amd64",
		Filename: "datrixops-agent-windows-amd64.exe",
	},
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "sign release: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	version, err := requiredEnv("AGENT_VERSION")
	if err != nil {
		return err
	}

	releaseDir, err := requiredEnv("AGENT_RELEASE_DIR")
	if err != nil {
		return err
	}

	releaseBaseURL, err := requiredEnv("AGENT_RELEASE_BASE_URL")
	if err != nil {
		return err
	}

	privateKeyBase64, err := requiredEnv("AGENT_SIGNING_PRIVATE_KEY")
	if err != nil {
		return err
	}

	if err := validateVersion(version); err != nil {
		return err
	}

	releaseBaseURL, err = validateBaseURL(releaseBaseURL)
	if err != nil {
		return err
	}

	privateKey, err := decodePrivateKey(privateKeyBase64)
	if err != nil {
		return err
	}

	manifest, err := buildManifest(
		version,
		releaseDir,
		releaseBaseURL,
	)
	if err != nil {
		return err
	}

	if err := manifest.Validate(); err != nil {
		return fmt.Errorf("validate generated manifest: %w", err)
	}

	manifestBytes, err := json.MarshalIndent(
		manifest,
		"",
		"  ",
	)
	if err != nil {
		return fmt.Errorf("encode manifest: %w", err)
	}

	// File được ký phải giống chính xác file được ghi xuống ổ đĩa.
	manifestBytes = append(manifestBytes, '\n')

	signature := ed25519.Sign(
		privateKey,
		manifestBytes,
	)

	if len(signature) != ed25519.SignatureSize {
		return fmt.Errorf(
			"unexpected signature length: got %d, expected %d",
			len(signature),
			ed25519.SignatureSize,
		)
	}

	publicKey, ok := privateKey.Public().(ed25519.PublicKey)
	if !ok {
		return fmt.Errorf("derive Ed25519 public key")
	}

	// Tự kiểm tra chữ ký trước khi xuất release.
	if !ed25519.Verify(
		publicKey,
		manifestBytes,
		signature,
	) {
		return fmt.Errorf("generated signature verification failed")
	}

	manifestPath := filepath.Join(
		releaseDir,
		"manifest.json",
	)

	signaturePath := filepath.Join(
		releaseDir,
		"manifest.sig",
	)

	if err := writeFileAtomic(
		manifestPath,
		manifestBytes,
		0o644,
	); err != nil {
		return fmt.Errorf("write manifest.json: %w", err)
	}

	// manifest.sig là 64 byte nhị phân, không phải Base64.
	if err := writeFileAtomic(
		signaturePath,
		signature,
		0o644,
	); err != nil {
		return fmt.Errorf("write manifest.sig: %w", err)
	}

	fmt.Println("Release manifest signed successfully")
	fmt.Println("Version   :", version)
	fmt.Println("Artifacts :", len(manifest.Artifacts))
	fmt.Println("Manifest  :", manifestPath)
	fmt.Println("Signature :", signaturePath)

	return nil
}

func requiredEnv(name string) (string, error) {
	value := strings.TrimSpace(os.Getenv(name))

	if value == "" {
		return "", fmt.Errorf(
			"missing environment variable: %s",
			name,
		)
	}

	return value, nil
}

func validateVersion(version string) error {
	if version == "" {
		return fmt.Errorf("agent version is empty")
	}

	if len(version) > 128 {
		return fmt.Errorf("agent version is too long")
	}

	if version == "." || version == ".." {
		return fmt.Errorf("invalid agent version: %q", version)
	}

	if strings.ContainsAny(version, `/\`) {
		return fmt.Errorf(
			"agent version must not contain path separators: %q",
			version,
		)
	}

	if strings.ContainsAny(version, " \t\r\n") {
		return fmt.Errorf(
			"agent version must not contain whitespace: %q",
			version,
		)
	}

	return nil
}

func validateBaseURL(rawURL string) (string, error) {
	parsedURL, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		return "", fmt.Errorf(
			"parse release base URL: %w",
			err,
		)
	}

	if parsedURL.Scheme != "https" {
		return "", fmt.Errorf(
			"release base URL must use HTTPS",
		)
	}

	if parsedURL.Host == "" {
		return "", fmt.Errorf(
			"release base URL is missing host",
		)
	}

	if parsedURL.User != nil {
		return "", fmt.Errorf(
			"release base URL must not contain credentials",
		)
	}

	if parsedURL.RawQuery != "" || parsedURL.Fragment != "" {
		return "", fmt.Errorf(
			"release base URL must not contain query or fragment",
		)
	}

	return strings.TrimRight(parsedURL.String(), "/"), nil
}

func decodePrivateKey(encoded string) (ed25519.PrivateKey, error) {
	// Cho phép giá trị Base64 bị xuống dòng khi copy từ secret store.
	encoded = strings.Join(
		strings.Fields(encoded),
		"",
	)

	keyBytes, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		keyBytes, err = base64.RawStdEncoding.DecodeString(encoded)
		if err != nil {
			return nil, fmt.Errorf(
				"decode Ed25519 private key: %w",
				err,
			)
		}
	}

	switch len(keyBytes) {
	case ed25519.SeedSize:
		return ed25519.NewKeyFromSeed(keyBytes), nil

	case ed25519.PrivateKeySize:
		privateKey := make(
			ed25519.PrivateKey,
			ed25519.PrivateKeySize,
		)
		copy(privateKey, keyBytes)

		return privateKey, nil

	default:
		return nil, fmt.Errorf(
			"invalid Ed25519 private key length: got %d, expected %d-byte seed or %d-byte private key",
			len(keyBytes),
			ed25519.SeedSize,
			ed25519.PrivateKeySize,
		)
	}
}

func buildManifest(
	version string,
	releaseDir string,
	baseURL string,
) (*update.Manifest, error) {
	releaseInfo, err := os.Stat(releaseDir)
	if err != nil {
		return nil, fmt.Errorf(
			"inspect release directory: %w",
			err,
		)
	}

	if !releaseInfo.IsDir() {
		return nil, fmt.Errorf(
			"release path is not a directory: %s",
			releaseDir,
		)
	}

	manifest := &update.Manifest{
		SchemaVersion: update.SupportedManifestSchemaVersion,
		Version:       version,
		PublishedAt:   time.Now().UTC(),
		Artifacts:     make([]update.Artifact, 0, len(targets)),
	}

	for _, target := range targets {
		artifactPath := filepath.Join(
			releaseDir,
			target.Filename,
		)

		checksum, size, err := hashFile(artifactPath)
		if err != nil {
			return nil, fmt.Errorf(
				"process artifact %s: %w",
				target.Filename,
				err,
			)
		}

		artifactURL, err := url.JoinPath(
			baseURL,
			version,
			target.Filename,
		)
		if err != nil {
			return nil, fmt.Errorf(
				"build URL for %s: %w",
				target.Filename,
				err,
			)
		}

		manifest.Artifacts = append(
			manifest.Artifacts,
			update.Artifact{
				OS:     target.OS,
				Arch:   target.Arch,
				URL:    artifactURL,
				SHA256: checksum,
				Size:   size,
			},
		)
	}

	return manifest, nil
}

func hashFile(path string) (string, int64, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", 0, err
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		return "", 0, fmt.Errorf("stat file: %w", err)
	}

	if !info.Mode().IsRegular() {
		return "", 0, fmt.Errorf(
			"artifact is not a regular file",
		)
	}

	if info.Size() <= 0 {
		return "", 0, fmt.Errorf(
			"artifact is empty",
		)
	}

	hasher := sha256.New()

	written, err := io.Copy(hasher, file)
	if err != nil {
		return "", 0, fmt.Errorf(
			"calculate SHA-256: %w",
			err,
		)
	}

	if written != info.Size() {
		return "", 0, fmt.Errorf(
			"artifact size changed while hashing: expected %d, read %d",
			info.Size(),
			written,
		)
	}

	return hex.EncodeToString(hasher.Sum(nil)), written, nil
}

func writeFileAtomic(
	path string,
	content []byte,
	permissions os.FileMode,
) error {
	directory := filepath.Dir(path)

	tempFile, err := os.CreateTemp(
		directory,
		"."+filepath.Base(path)+".tmp-*",
	)
	if err != nil {
		return err
	}

	tempPath := tempFile.Name()
	defer os.Remove(tempPath)

	if err := tempFile.Chmod(permissions); err != nil {
		tempFile.Close()
		return err
	}

	if _, err := tempFile.Write(content); err != nil {
		tempFile.Close()
		return err
	}

	if err := tempFile.Sync(); err != nil {
		tempFile.Close()
		return err
	}

	if err := tempFile.Close(); err != nil {
		return err
	}

	if err := os.Rename(tempPath, path); err != nil {
		return err
	}

	return nil
}
