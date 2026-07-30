package database

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
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
	if _, err := db.Pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version TEXT PRIMARY KEY,
			checksum TEXT NOT NULL,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	files, err := os.ReadDir("migrations")
	if err != nil {
		log.Warn("no migrations directory found, skipping auto-migration")
		return nil
	}

	for _, file := range files {
		if file.IsDir() || !isMigrationFile(file.Name()) {
			continue
		}

		content, err := os.ReadFile(filepath.Join("migrations", file.Name()))
		if err != nil {
			return fmt.Errorf("read migration %s: %w", file.Name(), err)
		}

		sum := sha256.Sum256(content)
		checksum := hex.EncodeToString(sum[:])

		var recordedChecksum string
		err = db.Pool.QueryRow(ctx,
			`SELECT checksum FROM schema_migrations WHERE version = $1`,
			file.Name(),
		).Scan(&recordedChecksum)
		switch {
		case err == nil:
			if recordedChecksum != checksum {
				return fmt.Errorf("migration %s checksum changed after it was applied", file.Name())
			}
			continue
		case !errors.Is(err, pgx.ErrNoRows):
			return fmt.Errorf("read migration state %s: %w", file.Name(), err)
		}

		tx, err := db.Pool.Begin(ctx)
		if err != nil {
			return fmt.Errorf("begin migration %s: %w", file.Name(), err)
		}
		if _, err = tx.Exec(ctx, string(content)); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("execute migration %s: %w", file.Name(), err)
		}
		if _, err = tx.Exec(ctx,
			`INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)`,
			file.Name(), checksum,
		); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("record migration %s: %w", file.Name(), err)
		}
		if err = tx.Commit(ctx); err != nil {
			return fmt.Errorf("commit migration %s: %w", file.Name(), err)
		}
		log.Info("applied migration", "file", file.Name())
	}
	return nil
}

func isMigrationFile(name string) bool {
	// Finder and some archive tools can create AppleDouble files such as
	// ._20260712_001_create_auth_tables.sql. They are binary metadata, not SQL.
	return !strings.HasPrefix(name, ".") && strings.HasSuffix(name, ".sql")
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
		"schema_migrations",
		"system_settings",
		"system_runtime",
		"website_checks",
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
