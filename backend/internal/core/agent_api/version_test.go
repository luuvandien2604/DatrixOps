package agent_api

import "testing"

func TestCompareAgentVersions(t *testing.T) {
	tests := []struct {
		name        string
		left, right string
		want        int
	}{
		{name: "older patch", left: "1.4.7", right: "1.4.8", want: -1},
		{name: "equal", left: "1.4.8", right: "1.4.8", want: 0},
		{name: "equal build metadata", left: "1.4.8+build.2", right: "1.4.8", want: 0},
		{name: "newer agent is not downgraded", left: "1.5.0", right: "1.4.8", want: 1},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := compareAgentVersions(test.left, test.right); got != test.want {
				t.Fatalf("compareAgentVersions(%q, %q) = %d, want %d", test.left, test.right, got, test.want)
			}
		})
	}
}
