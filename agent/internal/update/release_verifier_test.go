package update

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestVerifyReleaseDirectory(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(t *testing.T, dir string, manifest *Manifest, privateKey ed25519.PrivateKey)
	}{
		{name: "valid"},
		{name: "invalid signature", mutate: func(t *testing.T, dir string, _ *Manifest, _ ed25519.PrivateKey) {
			writeTestFile(t, filepath.Join(dir, "manifest.sig"), make([]byte, ed25519.SignatureSize))
		}},
		{name: "changed manifest", mutate: func(t *testing.T, dir string, _ *Manifest, _ ed25519.PrivateKey) {
			file := filepath.Join(dir, "manifest.json")
			content, err := os.ReadFile(file)
			if err != nil {
				t.Fatal(err)
			}
			writeTestFile(t, file, append(content, ' '))
		}},
		{name: "changed binary", mutate: func(t *testing.T, dir string, _ *Manifest, _ ed25519.PrivateKey) {
			writeTestFile(t, filepath.Join(dir, RequiredReleaseTargets[0].Filename), []byte("changed"))
		}},
		{name: "wrong version", mutate: func(t *testing.T, dir string, manifest *Manifest, key ed25519.PrivateKey) {
			manifest.Version = "9.9.9"
			writeSignedTestManifest(t, dir, manifest, key)
		}},
		{name: "missing artifact", mutate: func(t *testing.T, dir string, _ *Manifest, _ ed25519.PrivateKey) {
			if err := os.Remove(filepath.Join(dir, RequiredReleaseTargets[0].Filename)); err != nil {
				t.Fatal(err)
			}
		}},
		{name: "wrong os architecture metadata", mutate: func(t *testing.T, dir string, manifest *Manifest, key ed25519.PrivateKey) {
			manifest.Artifacts[0].Arch = "386"
			writeSignedTestManifest(t, dir, manifest, key)
		}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			dir, manifest, publicKey, privateKey := createSignedTestRelease(t)
			if test.mutate != nil {
				test.mutate(t, dir, manifest, privateKey)
			}
			_, err := VerifyReleaseDirectory(dir, "1.2.3", publicKey)
			if test.name == "valid" && err != nil {
				t.Fatalf("verify valid release: %v", err)
			}
			if test.name != "valid" && err == nil {
				t.Fatal("expected verification failure")
			}
		})
	}
}

func createSignedTestRelease(t *testing.T) (string, *Manifest, ed25519.PublicKey, ed25519.PrivateKey) {
	t.Helper()
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	manifest := &Manifest{SchemaVersion: SupportedManifestSchemaVersion, Version: "1.2.3", PublishedAt: time.Now().UTC()}
	for _, target := range RequiredReleaseTargets {
		content := []byte("binary-" + target.OS + "-" + target.Arch)
		writeTestFile(t, filepath.Join(dir, target.Filename), content)
		sum := sha256.Sum256(content)
		manifest.Artifacts = append(manifest.Artifacts, Artifact{OS: target.OS, Arch: target.Arch, URL: "https://releases.example/1.2.3/" + target.Filename, SHA256: hex.EncodeToString(sum[:]), Size: int64(len(content))})
	}
	writeSignedTestManifest(t, dir, manifest, privateKey)
	return dir, manifest, publicKey, privateKey
}

func writeSignedTestManifest(t *testing.T, dir string, manifest *Manifest, privateKey ed25519.PrivateKey) {
	t.Helper()
	content, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	content = append(content, '\n')
	writeTestFile(t, filepath.Join(dir, "manifest.json"), content)
	writeTestFile(t, filepath.Join(dir, "manifest.sig"), ed25519.Sign(privateKey, content))
}

func writeTestFile(t *testing.T, filename string, content []byte) {
	t.Helper()
	if err := os.WriteFile(filename, content, 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestVerifyReleaseDirectoryRejectsMalformedSHA256(t *testing.T) {
	dir, manifest, publicKey, privateKey := createSignedTestRelease(t)
	manifest.Artifacts[0].SHA256 = strings.Repeat("z", 64)
	writeSignedTestManifest(t, dir, manifest, privateKey)
	if _, err := VerifyReleaseDirectory(dir, "1.2.3", publicKey); err == nil {
		t.Fatal("expected malformed SHA-256 to fail")
	}
}

func TestVerifyReleaseDirectoryRejectsWrongSigningKey(t *testing.T) {
	dir, _, _, _ := createSignedTestRelease(t)
	officialPublicKey, err := ReleasePublicKey()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := VerifyReleaseDirectory(dir, "1.2.3", officialPublicKey); err == nil {
		t.Fatal("expected a release signed by a different key to fail")
	}
}
