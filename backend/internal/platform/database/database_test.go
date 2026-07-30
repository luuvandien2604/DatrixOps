package database

import "testing"

func TestIsMigrationFile(t *testing.T) {
	t.Parallel()

	tests := map[string]bool{
		"20260730_001_schema.sql":   true,
		"._20260730_001_schema.sql": false,
		".hidden.sql":               false,
		"README.md":                 false,
		"migration.SQL":             false,
	}

	for name, want := range tests {
		if got := isMigrationFile(name); got != want {
			t.Errorf("isMigrationFile(%q) = %v, want %v", name, got, want)
		}
	}
}
