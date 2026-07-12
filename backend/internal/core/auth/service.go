package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrUserExists        = errors.New("user already exists")
	ErrRegistrationClosed= errors.New("registration is closed (single user constraint)")
	ErrInvalidCredentials= errors.New("invalid email or password")
	ErrInvalidToken      = errors.New("invalid or expired token")
)

type Service struct {
	repo      *Repository
	jwtSecret []byte
}

func NewService(repo *Repository, jwtSecret string) *Service {
	return &Service{
		repo:      repo,
		jwtSecret: []byte(jwtSecret),
	}
}

// Register creates the first and ONLY user in the system.
func (s *Service) Register(ctx context.Context, email, password string) (*User, error) {
	// Single user constraint check
	count, err := s.repo.UserCount(ctx)
	if err != nil {
		return nil, fmt.Errorf("check user count: %w", err)
	}
	if count > 0 {
		return nil, ErrRegistrationClosed
	}

	// Check if email somehow exists (race condition guard)
	existing, err := s.repo.FindUserByEmail(ctx, email)
	if err != nil {
		return nil, fmt.Errorf("check existing user: %w", err)
	}
	if existing != nil {
		return nil, ErrUserExists
	}

	// Hash password
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	// Create user
	user, err := s.repo.CreateUser(ctx, email, string(hash))
	if err != nil {
		return nil, fmt.Errorf("create user in db: %w", err)
	}

	return user, nil
}

type AuthResult struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"` // seconds
}

// Login verifies credentials and issues tokens.
func (s *Service) Login(ctx context.Context, email, password string) (*AuthResult, error) {
	user, err := s.repo.FindUserByEmail(ctx, email)
	if err != nil {
		return nil, fmt.Errorf("find user: %w", err)
	}
	if user == nil {
		return nil, ErrInvalidCredentials
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	return s.issueTokens(ctx, user.ID)
}

// Refresh issues a new access token using a valid refresh token.
func (s *Service) Refresh(ctx context.Context, refreshToken string) (*AuthResult, error) {
	rt, err := s.repo.FindRefreshToken(ctx, refreshToken)
	if err != nil {
		return nil, fmt.Errorf("find refresh token: %w", err)
	}
	if rt == nil || rt.ExpiresAt.Before(time.Now()) {
		return nil, ErrInvalidToken
	}

	// Optionally revoke the old refresh token (refresh token rotation)
	// For simplicity in MVP, we just issue new access token and keep same refresh token,
	// OR we can rotate it. Let's rotate it for better security.
	_ = s.repo.DeleteRefreshToken(ctx, refreshToken)

	return s.issueTokens(ctx, rt.UserID)
}

// Logout revokes the given refresh token.
func (s *Service) Logout(ctx context.Context, refreshToken string) error {
	return s.repo.DeleteRefreshToken(ctx, refreshToken)
}

// issueTokens is a helper to generate JWT and Refresh token.
func (s *Service) issueTokens(ctx context.Context, userID string) (*AuthResult, error) {
	// 1. Generate JWT Access Token (15 minutes)
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.RegisteredClaims{
		Subject:   userID,
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(15 * time.Minute)),
		IssuedAt:  jwt.NewNumericDate(time.Now()),
	})

	accessToken, err := token.SignedString(s.jwtSecret)
	if err != nil {
		return nil, fmt.Errorf("sign jwt: %w", err)
	}

	// 2. Generate Opaque Refresh Token (7 days)
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return nil, fmt.Errorf("generate random string: %w", err)
	}
	refreshTokenStr := hex.EncodeToString(b)
	expiresAt := time.Now().Add(7 * 24 * time.Hour)

	// Save refresh token to DB
	if err := s.repo.CreateRefreshToken(ctx, userID, refreshTokenStr, expiresAt); err != nil {
		return nil, fmt.Errorf("save refresh token: %w", err)
	}

	return &AuthResult{
		AccessToken:  accessToken,
		RefreshToken: refreshTokenStr,
		ExpiresIn:    15 * 60, // 15 minutes in seconds
	}, nil
}
