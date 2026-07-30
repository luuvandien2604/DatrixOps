package database

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// DB wraps pgxpool.Pool to provide a clean interface.
type DB struct {
	Pool *pgxpool.Pool
}

// Connect establishes a connection pool to PostgreSQL.
func Connect(ctx context.Context, databaseURL string, log *slog.Logger) (*DB, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}

	config.MaxConns = 25
	config.MinConns = 5
	config.MaxConnLifetime = 30 * time.Minute
	config.MaxConnIdleTime = 5 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("create connection pool: %w", err)
	}

	// Verify connection
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	log.Info("database connected", "host", config.ConnConfig.Host, "database", config.ConnConfig.Database)

	return &DB{Pool: pool}, nil
}

// AutoMigrate reads and executes .sql files in the migrations directory.
func (db *DB) AutoMigrate(ctx context.Context, log *slog.Logger) error {
	files, err := os.ReadDir("migrations")
	if err != nil {
		log.Warn("no migrations directory found, skipping auto-migration")
		return nil
	}

	for _, file := range files {
		if file.IsDir() || !strings.HasSuffix(file.Name(), ".sql") {
			continue
		}

		content, err := os.ReadFile(filepath.Join("migrations", file.Name()))
		if err != nil {
			return fmt.Errorf("read migration %s: %w", file.Name(), err)
		}

		_, err = db.Pool.Exec(ctx, string(content))
		if err != nil {
			return fmt.Errorf("execute migration %s: %w", file.Name(), err)
		}
		log.Info("applied migration", "file", file.Name())
	}
	return nil
}

// VerifySchema checks that the application was migrated before the API starts.
func (db *DB) VerifySchema(ctx context.Context) error {
	requiredTables := []string{
		"users",
		"servers",
		"server_metrics",
		"websites",
		"alert_rules",
		"server_tasks",
	}
	for _, table := range requiredTables {
		var exists bool
		if err := db.Pool.QueryRow(ctx, `SELECT to_regclass($1) IS NOT NULL`, "public."+table).Scan(&exists); err != nil {
			return fmt.Errorf("check table %s: %w", table, err)
		}
		if !exists {
			return fmt.Errorf("database schema is not migrated: missing table %s", table)
		}
	}
	return nil
}

// Ping checks if the database is reachable.
func (db *DB) Ping(ctx context.Context) error {
	return db.Pool.Ping(ctx)
}

// Close shuts down the connection pool.
func (db *DB) Close() {
	db.Pool.Close()
}
