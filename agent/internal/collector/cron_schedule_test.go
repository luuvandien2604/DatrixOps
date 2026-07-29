package collector

import (
	"testing"
	"time"
)

func TestNextCronRun(t *testing.T) {
	tests := []struct {
		name     string
		schedule string
		after    string
		want     string
	}{
		{
			name:     "every five minutes",
			schedule: "*/5 * * * *",
			after:    "2026-07-29T11:02:14Z",
			want:     "2026-07-29T11:05:00Z",
		},
		{
			name:     "daily macro",
			schedule: "@daily",
			after:    "2026-07-29T11:02:14Z",
			want:     "2026-07-30T00:00:00Z",
		},
		{
			name:     "weekday range",
			schedule: "30 8 * * 1-5",
			after:    "2026-07-29T11:02:14Z",
			want:     "2026-07-30T08:30:00Z",
		},
		{
			name:     "day of month and day of week use cron or semantics",
			schedule: "0 9 1 * 5",
			after:    "2026-07-29T11:02:14Z",
			want:     "2026-07-31T09:00:00Z",
		},
		{
			name:     "sunday can be seven",
			schedule: "0 12 * * 7",
			after:    "2026-07-29T11:02:14Z",
			want:     "2026-08-02T12:00:00Z",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			after, err := time.Parse(time.RFC3339, test.after)
			if err != nil {
				t.Fatal(err)
			}
			want, err := time.Parse(time.RFC3339, test.want)
			if err != nil {
				t.Fatal(err)
			}
			got := nextCronRun(test.schedule, after)
			if got == nil {
				t.Fatalf("nextCronRun(%q) returned nil", test.schedule)
			}
			if !got.Equal(want) {
				t.Fatalf("nextCronRun(%q) = %s, want %s", test.schedule, got.Format(time.RFC3339), want.Format(time.RFC3339))
			}
		})
	}
}

func TestNextCronRunUnsupported(t *testing.T) {
	after := time.Date(2026, 7, 29, 11, 2, 14, 0, time.UTC)
	if got := nextCronRun("@reboot", after); got != nil {
		t.Fatalf("nextCronRun(@reboot) = %s, want nil", got.Format(time.RFC3339))
	}
	if got := nextCronRun("not a cron schedule", after); got != nil {
		t.Fatalf("nextCronRun(invalid) = %s, want nil", got.Format(time.RFC3339))
	}
}
