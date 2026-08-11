package update

import "testing"

func TestParseLayout(t *testing.T) {
	tests := []struct {
		input   string
		want    string
		wantErr bool
	}{
		{"", LayoutDefault, false},
		{"default", LayoutDefault, false},
		{"DEFAULT", LayoutDefault, false},
		{"github", LayoutGitHub, false},
		{"GitHub", LayoutGitHub, false},
		{"legacy_direct", LayoutLegacyDirect, false},
		{"s3", "", true},
		{"azure", "", true},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got, err := ParseLayout(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error for input %q", tt.input)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("ParseLayout(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestVersionDir(t *testing.T) {
	vDir, err := VersionDir(LayoutGitHub, "1.5.5")
	if err != nil || vDir != "v1.5.5" {
		t.Fatalf("VersionDir(github, 1.5.5) = %q, err %v, want v1.5.5", vDir, err)
	}
	vDir, err = VersionDir(LayoutDefault, "1.5.5")
	if err != nil || vDir != "1.5.5" {
		t.Fatalf("VersionDir(default, 1.5.5) = %q, err %v, want 1.5.5", vDir, err)
	}
	vDir, err = VersionDir(LayoutLegacyDirect, "1.5.5")
	if err != nil || vDir != "" {
		t.Fatalf("VersionDir(legacy_direct, 1.5.5) = %q, err %v, want ''", vDir, err)
	}

	// Invalid version
	if _, err := VersionDir(LayoutGitHub, "v1.5.5"); err == nil {
		t.Fatal("expected error for invalid semver 'v1.5.5'")
	}
}

func TestArtifactBaseURL(t *testing.T) {
	tests := []struct {
		name    string
		base    string
		layout  string
		version string
		want    string
		wantErr bool
	}{
		{
			name:    "github layout",
			base:    "https://github.com/luuvandien2604/DatrixOps/releases/download",
			layout:  LayoutGitHub,
			version: "1.5.5",
			want:    "https://github.com/luuvandien2604/DatrixOps/releases/download/v1.5.5",
		},
		{
			name:    "default layout",
			base:    "https://cloud.example.com/releases",
			layout:  LayoutDefault,
			version: "1.5.5",
			want:    "https://cloud.example.com/releases/1.5.5",
		},
		{
			name:    "legacy direct layout",
			base:    "https://github.com/luuvandien2604/DatrixOps/releases/download/v1.5.5",
			layout:  LayoutLegacyDirect,
			version: "1.5.5",
			want:    "https://github.com/luuvandien2604/DatrixOps/releases/download/v1.5.5",
		},
		{
			name:    "empty base URL error",
			base:    "",
			layout:  LayoutDefault,
			version: "1.5.5",
			wantErr: true,
		},
		{
			name:    "invalid layout error",
			base:    "https://example.com",
			layout:  "invalid",
			version: "1.5.5",
			wantErr: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ArtifactBaseURL(tt.base, tt.layout, tt.version)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error for %s", tt.name)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("ArtifactBaseURL = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestManifestAndSignatureURL(t *testing.T) {
	base := "https://github.com/luuvandien2604/DatrixOps/releases/download"
	mURL, err := ManifestURL(base, LayoutGitHub, "1.5.5")
	if err != nil || mURL != "https://github.com/luuvandien2604/DatrixOps/releases/download/v1.5.5/manifest.json" {
		t.Fatalf("ManifestURL = %q, err %v", mURL, err)
	}

	sigURL, err := SignatureURL(base, LayoutGitHub, "1.5.5")
	if err != nil || sigURL != "https://github.com/luuvandien2604/DatrixOps/releases/download/v1.5.5/manifest.sig" {
		t.Fatalf("SignatureURL = %q, err %v", sigURL, err)
	}
}

func TestArtifactURL(t *testing.T) {
	// Relative artifact
	got, err := ArtifactURL("https://cloud.example.com/releases", LayoutDefault, "1.5.5", "datrixops-agent-linux-amd64")
	if err != nil || got != "https://cloud.example.com/releases/1.5.5/datrixops-agent-linux-amd64" {
		t.Fatalf("ArtifactURL relative = %q, err %v", got, err)
	}

	// Absolute artifact passthrough
	got, err = ArtifactURL("https://cloud.example.com/releases", LayoutDefault, "1.5.5", "https://cdn.example.com/binary")
	if err != nil || got != "https://cdn.example.com/binary" {
		t.Fatalf("ArtifactURL absolute = %q, err %v", got, err)
	}

	// Empty artifact path error
	if _, err := ArtifactURL("https://cloud.example.com/releases", LayoutDefault, "1.5.5", ""); err == nil {
		t.Fatal("expected error for empty artifact path")
	}
}
