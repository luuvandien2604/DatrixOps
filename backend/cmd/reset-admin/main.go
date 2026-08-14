package main

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/logger"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	log := logger.New()
	if len(os.Args) != 2 {
		log.Error("usage: reset_admin <administrator-username-or-email>; provide the new password on stdin")
		os.Exit(2)
	}
	identifier := strings.ToLower(strings.TrimSpace(os.Args[1]))
	if identifier == "" || len(identifier) > 254 {
		log.Error("administrator username or email is invalid")
		os.Exit(2)
	}

	password, err := bufio.NewReader(io.LimitReader(os.Stdin, 1024)).ReadString('\n')
	if err != nil && err != io.EOF {
		log.Error("unable to read password", "error", err)
		os.Exit(1)
	}
	password = strings.TrimRight(password, "\r\n")
	if len(password) < 12 || len(password) > 128 {
		log.Error("password must contain between 12 and 128 characters")
		os.Exit(2)
	}
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		log.Error("unable to hash password", "error", err)
		os.Exit(1)
	}

	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if databaseURL == "" {
		log.Error("DATABASE_URL is required")
		os.Exit(1)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	db, err := database.Connect(ctx, databaseURL, log)
	if err != nil {
		log.Error("unable to connect to database", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		log.Error("unable to start password reset", "error", err)
		os.Exit(1)
	}
	defer tx.Rollback(ctx)

	var userID string
	err = tx.QueryRow(ctx, `
		UPDATE users
		SET password_hash = $1
		WHERE (lower(username) = $2 OR lower(email) = $2)
		  AND role IN ('superadmin', 'admin')
		RETURNING id
	`, string(passwordHash), identifier).Scan(&userID)
	if err != nil {
		log.Error("administrator account was not found", "identifier", identifier)
		os.Exit(1)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM refresh_tokens WHERE user_id = $1`, userID); err != nil {
		log.Error("unable to revoke existing sessions", "error", err)
		os.Exit(1)
	}
	if err := tx.Commit(ctx); err != nil {
		log.Error("unable to commit password reset", "error", err)
		os.Exit(1)
	}
	fmt.Println("Administrator password reset; all refresh sessions were revoked.")
}
