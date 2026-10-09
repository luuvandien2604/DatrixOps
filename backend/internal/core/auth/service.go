package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/notifier"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrUserExists         = errors.New("user already exists")
	ErrRegistrationClosed = errors.New("registration is closed (single user constraint)")
	ErrInvalidCredentials = errors.New("invalid username or password")
	ErrInvalidToken       = errors.New("invalid or expired token")
)

type Service struct {
	repo              *Repository
	jwtSecret         []byte
	dummyPasswordHash []byte
}

func NewService(repo *Repository, jwtSecret string) *Service {
	// A startup-only dummy hash keeps unknown-user and wrong-password paths
	// approximately equivalent, reducing username discovery via timing.
	dummyHash, _ := bcrypt.GenerateFromPassword([]byte("datrixops-invalid-login-placeholder"), bcrypt.DefaultCost)
	return &Service{
		repo:              repo,
		jwtSecret:         []byte(jwtSecret),
		dummyPasswordHash: dummyHash,
	}
}

// Register creates the first and ONLY user in the system.
func (s *Service) Register(ctx context.Context, email, password string) (*User, error) {
	// Single user constraint check - REMOVED FOR MULTI-TENANT
	count, err := s.repo.UserCount(ctx)
	if err != nil {
		return nil, fmt.Errorf("check user count: %w", err)
	}

	role := "user"
	if count == 0 {
		role = "superadmin"
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
	user, err := s.repo.CreateUser(ctx, email, string(hash), role)
	if err != nil {
		return nil, fmt.Errorf("create user in db: %w", err)
	}

	if role == "superadmin" {
		_ = s.repo.ClaimSelfHostServer(ctx, user.ID)
	}

	return user, nil
}

type AuthResult struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"` // seconds
	UserID       string `json:"user_id,omitempty"`
}

// Login verifies credentials and issues tokens.
func (s *Service) Login(ctx context.Context, identifier, password string) (*AuthResult, error) {
	user, err := s.repo.FindUserByIdentifier(ctx, identifier)
	if err != nil {
		return nil, fmt.Errorf("find user: %w", err)
	}
	if user == nil {
		_ = bcrypt.CompareHashAndPassword(s.dummyPasswordHash, []byte(password))
		return nil, ErrInvalidCredentials
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	return s.issueTokens(ctx, user.ID, user.Role)
}

// Refresh issues a new access token using a valid refresh token.
func (s *Service) Refresh(ctx context.Context, refreshToken string) (*AuthResult, error) {
	rt, err := s.repo.ConsumeRefreshToken(ctx, refreshToken)
	if err != nil {
		return nil, fmt.Errorf("find refresh token: %w", err)
	}
	if rt == nil {
		return nil, ErrInvalidToken
	}

	user, err := s.repo.FindUserByID(ctx, rt.UserID)
	if err != nil || user == nil {
		return nil, ErrInvalidToken
	}

	return s.issueTokens(ctx, rt.UserID, user.Role)
}

// Logout revokes the given refresh token.
func (s *Service) Logout(ctx context.Context, refreshToken string) error {
	return s.repo.DeleteRefreshToken(ctx, refreshToken)
}

// issueTokens is a helper to generate JWT and Refresh token.
func (s *Service) issueTokens(ctx context.Context, userID, role string) (*AuthResult, error) {
	// 1. Generate JWT Access Token (15 minutes)
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":  userID,
		"role": role,
		"exp":  time.Now().Add(15 * time.Minute).Unix(),
		"iat":  time.Now().Unix(),
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
		UserID:       userID,
	}, nil
}

// ForgotPassword generates a time-limited password reset token.
func (s *Service) ForgotPassword(ctx context.Context, email string) (string, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		return "", nil
	}
	user, err := s.repo.FindUserByEmail(ctx, email)
	if err != nil || user == nil {
		return "", nil
	}
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate reset token: %w", err)
	}
	rawToken := hex.EncodeToString(b)
	sum := sha256.Sum256([]byte(rawToken))
	tokenHash := hex.EncodeToString(sum[:])
	expiresAt := time.Now().Add(1 * time.Hour)

	if err := s.repo.CreatePasswordResetToken(ctx, email, tokenHash, expiresAt); err != nil {
		return "", fmt.Errorf("store reset token: %w", err)
	}

	// Dispatch email asynchronously if SMTP is enabled
	go func(targetEmail, token string) {
		ctxBg, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()

		settings, err := s.repo.GetSystemSMTPSettings(ctxBg)
		if err != nil || settings == nil || !settings.Enabled || settings.Host == "" || settings.FromEmail == "" {
			return
		}

		baseURL := strings.TrimRight(settings.PublicURL, "/")
		if baseURL == "" {
			baseURL = "http://localhost:3000"
		}

		resetURL := fmt.Sprintf("%s/reset-password?token=%s&email=%s", baseURL, token, url.QueryEscape(targetEmail))

		fromHeader := settings.FromEmail
		if settings.FromName != "" {
			fromHeader = fmt.Sprintf("%s <%s>", settings.FromName, settings.FromEmail)
		}

		emailConfig := notifier.EmailConfig{
			Host:     settings.Host,
			Port:     settings.Port,
			Username: settings.Username,
			Password: settings.Password,
			From:     fromHeader,
			To:       targetEmail,
			UseTLS:   settings.Encryption == "ssl" || settings.Port == 465,
		}

		subject := "[DatrixOps] Password Reset Request"
		htmlBody := fmt.Sprintf(`
			<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 8px;">
				<h2 style="color: #38bdf8; margin-top: 0;">Password Reset Request</h2>
				<p>We received a request to reset the password for your DatrixOps account (<strong>%s</strong>).</p>
				<p style="margin: 24px 0;">
					<a href="%s" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px;">Reset Password</a>
				</p>
				<p style="font-size: 12px; color: #94a3b8;">If the button does not work, copy and paste this link into your browser:<br /><a href="%s" style="color: #38bdf8; word-break: break-all;">%s</a></p>
				<hr style="border: 0; border-top: 1px solid #334155; margin: 20px 0;" />
				<p style="font-size: 11px; color: #64748b; margin-bottom: 0;">This link is valid for 60 minutes. If you did not request this, please disregard this email.</p>
			</div>
		`, targetEmail, resetURL, resetURL, resetURL)

		_ = notifier.SendEmail(emailConfig, subject, htmlBody)
	}(email, rawToken)

	return rawToken, nil
}

// ResetPassword verifies the token and updates the user's password.
func (s *Service) ResetPassword(ctx context.Context, email, rawToken, newPassword string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	rawToken = strings.TrimSpace(rawToken)
	if len(newPassword) < 8 || len([]byte(newPassword)) > 72 {
		return errors.New("password must be between 8 and 72 characters")
	}

	sum := sha256.Sum256([]byte(rawToken))
	tokenHash := hex.EncodeToString(sum[:])

	valid, err := s.repo.ValidateAndConsumePasswordResetToken(ctx, email, tokenHash)
	if err != nil || !valid {
		return ErrInvalidToken
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash new password: %w", err)
	}

	user, err := s.repo.FindUserByEmail(ctx, email)
	if err != nil || user == nil {
		return ErrInvalidToken
	}

	if err := s.repo.UpdateUserPassword(ctx, user.ID, string(newHash)); err != nil {
		return fmt.Errorf("update password: %w", err)
	}

	_ = s.repo.RevokeAllRefreshTokens(ctx, user.ID)
	return nil
}
