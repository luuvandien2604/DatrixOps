package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/luuvandien2604/DatrixOps/agent/internal/client"
	"github.com/luuvandien2604/DatrixOps/agent/internal/config"
)

const maxCronTelemetryOutputBytes = 8192

type limitedBuffer struct {
	buffer bytes.Buffer
	limit  int
}

func (w *limitedBuffer) Write(p []byte) (int, error) {
	if w.limit <= 0 || w.buffer.Len() >= w.limit {
		return len(p), nil
	}
	remaining := w.limit - w.buffer.Len()
	if len(p) > remaining {
		_, _ = w.buffer.Write(p[:remaining])
		return len(p), nil
	}
	_, _ = w.buffer.Write(p)
	return len(p), nil
}

func (w *limitedBuffer) String() string {
	return w.buffer.String()
}

func runCronWrapperFromArgs(args []string) (bool, int) {
	if len(args) == 0 || args[0] != "cron-run" {
		return false, 0
	}

	flags := flag.NewFlagSet("cron-run", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	externalID := flags.String("external-id", "", "discovered cron job external_id")
	source := flags.String("source", "", "cron source used to derive external_id when omitted")
	owner := flags.String("owner", "", "cron owner used to derive external_id when omitted")
	schedule := flags.String("schedule", "", "cron schedule used to derive external_id when omitted")
	timeoutSeconds := flags.Int("timeout-seconds", 0, "optional command timeout in seconds")
	if err := flags.Parse(args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "Usage: datrixops-agent cron-run --external-id <id> -- <command> [args...]")
		return true, 2
	}

	commandArgs := flags.Args()
	if len(commandArgs) == 0 {
		fmt.Fprintln(os.Stderr, "cron-run requires a command after --")
		return true, 2
	}

	jobExternalID := strings.TrimSpace(*externalID)
	commandText := strings.Join(commandArgs, " ")
	if jobExternalID == "" {
		if strings.TrimSpace(*source) == "" || strings.TrimSpace(*schedule) == "" {
			fmt.Fprintln(os.Stderr, "cron-run requires --external-id, or --source and --schedule to derive one")
			return true, 2
		}
		sum := sha256.Sum256([]byte(strings.TrimSpace(*source) + "\x00" + strings.TrimSpace(*owner) + "\x00" + strings.TrimSpace(*schedule) + "\x00" + commandText))
		jobExternalID = hex.EncodeToString(sum[:])
	}

	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "cron-run cannot load DatrixOps config: %v\n", err)
		return true, 2
	}

	runCtx := context.Background()
	cancel := func() {}
	timedOut := false
	if *timeoutSeconds > 0 {
		var timeoutCancel context.CancelFunc
		runCtx, timeoutCancel = context.WithTimeout(runCtx, time.Duration(*timeoutSeconds)*time.Second)
		cancel = timeoutCancel
	}
	defer cancel()

	startedAt := time.Now().UTC()
	output := &limitedBuffer{limit: maxCronTelemetryOutputBytes}
	cmd := exec.CommandContext(runCtx, commandArgs[0], commandArgs[1:]...)
	cmd.Stdout = io.MultiWriter(os.Stdout, output)
	cmd.Stderr = io.MultiWriter(os.Stderr, output)
	err = cmd.Run()
	completedAt := time.Now().UTC()

	exitCode := 0
	status := "completed"
	if runCtx.Err() == context.DeadlineExceeded {
		timedOut = true
		status = "timed_out"
		exitCode = 124
	} else if err != nil {
		status = "failed"
		exitCode = 1
		var exitErr *exec.ExitError
		if ok := asExitError(err, &exitErr); ok {
			exitCode = exitErr.ExitCode()
		}
	}

	reportCtx, reportCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer reportCancel()
	apiClient := client.New(cfg)
	if reportErr := apiClient.ReportCronExecution(reportCtx, client.CronExecutionReport{
		ExternalID:  jobExternalID,
		StartedAt:   startedAt,
		CompletedAt: &completedAt,
		Status:      status,
		ExitCode:    &exitCode,
		Output:      output.String(),
	}); reportErr != nil {
		log.Printf("Failed to report cron execution telemetry: %v", reportErr)
	}

	if timedOut {
		return true, exitCode
	}
	return true, exitCode
}

func asExitError(err error, target **exec.ExitError) bool {
	if err == nil {
		return false
	}
	exitErr, ok := err.(*exec.ExitError)
	if !ok {
		return false
	}
	*target = exitErr
	return true
}
