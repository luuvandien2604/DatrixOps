package main

import (
	"context"
	"os"
	"strings"
	"time"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/logger"
)

func main() {
	log := logger.New()
	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if databaseURL == "" {
		log.Error("DATABASE_URL is required")
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	db, err := database.Connect(ctx, databaseURL, log)
	if err != nil {
		log.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := db.AutoMigrate(ctx, log); err != nil {
		log.Error("failed to migrate database", "error", err)
		os.Exit(1)
	}

	log.Info("database migration completed")
}
