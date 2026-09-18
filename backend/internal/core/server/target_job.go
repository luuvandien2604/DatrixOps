package server

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
)

// NetworkTargetJob periodically probes user-configured network targets across all agents.
type NetworkTargetJob struct {
	repo   *Repository
	db     *database.DB
	logger *slog.Logger
	ticker *time.Ticker
	quit   chan struct{}
}

// NewNetworkTargetJob creates a new background runner for network target probes.
func NewNetworkTargetJob(repo *Repository, db *database.DB, logger *slog.Logger) *NetworkTargetJob {
	return &NetworkTargetJob{
		repo:   repo,
		db:     db,
		logger: logger.With("component", "NetworkTargetJob"),
		quit:   make(chan struct{}),
	}
}

// Start launches the periodic probe scheduler.
func (j *NetworkTargetJob) Start() {
	j.ticker = time.NewTicker(60 * time.Second)
	j.logger.Info("Network target probe scheduler started")

	go func() {
		// Run initial probe pass on start
		j.run()

		for {
			select {
			case <-j.ticker.C:
				j.run()
			case <-j.quit:
				j.ticker.Stop()
				return
			}
		}
	}()
}

// Stop terminates the scheduler goroutine.
func (j *NetworkTargetJob) Stop() {
	close(j.quit)
}

func (j *NetworkTargetJob) run() {
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Second)
	defer cancel()

	targets, err := j.repo.GetAllEnabledNetworkTargets(ctx)
	if err != nil {
		j.logger.Error("failed to query enabled network targets for probing", "error", err)
		return
	}

	if len(targets) == 0 {
		return
	}

	const maxConcurrent = 10
	sem := make(chan struct{}, maxConcurrent)
	var wg sync.WaitGroup
	var mu sync.Mutex
	var results []NetworkTargetResult

	for _, target := range targets {
		select {
		case <-ctx.Done():
			j.logger.Warn("network target probe run timed out before all probes completed", "error", ctx.Err())
			break
		case sem <- struct{}{}:
		}

		wg.Add(1)
		go func(t NetworkTarget) {
			defer wg.Done()
			defer func() { <-sem }()

			probeCtx, probeCancel := context.WithTimeout(ctx, 15*time.Second)
			defer probeCancel()

			_, res := ProbeSingleTarget(probeCtx, t)

			mu.Lock()
			results = append(results, res)
			mu.Unlock()
		}(target)
	}

	wg.Wait()

	if len(results) > 0 {
		saveCtx, saveCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer saveCancel()

		if err := j.repo.SaveNetworkTargetResults(saveCtx, results); err != nil {
			j.logger.Error("failed to batch save network target probe results", "error", err, "count", len(results))
		}
	}
}
