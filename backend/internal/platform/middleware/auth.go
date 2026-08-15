package middleware

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/response"
)

type contextKey string

const UserIDKey contextKey = "user_id"
const UserRoleKey contextKey = "user_role"

// RequireAuth returns a middleware that validates a JWT access token or an API Key.
// If valid, the user_id is injected into the request Context.
func RequireAuth(jwtSecret []byte, db *database.DB) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "Missing Authorization header")
				return
			}

			parts := strings.Fields(authHeader)
			if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
				response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "Invalid Authorization header format")
				return
			}

			tokenStr := parts[1]
			var userID, role string

			if strings.HasPrefix(tokenStr, "dtx_") {
				// API Key mode
				if db == nil {
					response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "API Keys not supported")
					return
				}
				hash := sha256.Sum256([]byte(tokenStr))
				keyHash := hex.EncodeToString(hash[:])

				var uID, rRole string
				err := db.Pool.QueryRow(r.Context(),
					`SELECT a.user_id, u.role 
					 FROM api_keys a JOIN users u ON a.user_id = u.id 
					 WHERE a.key_hash = $1`,
					keyHash,
				).Scan(&uID, &rRole)

				if err != nil {
					response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "Invalid API Key")
					return
				}

				// Keep this bounded and tied to the request so abusive API-key
				// traffic cannot accumulate detached database goroutines.
				updateCtx, cancel := context.WithTimeout(r.Context(), time.Second)
				_, _ = db.Pool.Exec(updateCtx, `UPDATE api_keys SET last_used_at = NOW() WHERE key_hash = $1`, keyHash)
				cancel()

				userID = uID
				role = rRole
			} else {
				// JWT mode
				token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
					// Validate signing method
					if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
						return nil, jwt.ErrSignatureInvalid
					}
					return jwtSecret, nil
				}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}), jwt.WithExpirationRequired())

				if err != nil || !token.Valid {
					response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "Invalid or expired access token")
					return
				}

				// Extract user ID from Subject claim
				var errSub error
				userID, errSub = token.Claims.GetSubject()
				if errSub != nil || userID == "" {
					response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "Invalid token subject")
					return
				}

				// Resolve the current role on every request. This immediately
				// revokes deleted accounts and applies role changes instead of
				// trusting a possibly stale role embedded in the access token.
				if db == nil {
					response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User validation is unavailable")
					return
				}
				if err := db.Pool.QueryRow(r.Context(), `SELECT role FROM users WHERE id = $1`, userID).Scan(&role); err != nil {
					response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User account is no longer active")
					return
				}
			}

			// Add to context user ID and role into context
			ctx := context.WithValue(r.Context(), UserIDKey, userID)
			ctx = context.WithValue(ctx, UserRoleKey, role)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireRole returns a middleware that checks if the user has the required role.
// Must be used AFTER RequireAuth.
func RequireRole(allowedRoles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userRole, ok := r.Context().Value(UserRoleKey).(string)
			if !ok {
				response.Error(w, http.StatusForbidden, "FORBIDDEN", "Role not found in context")
				return
			}

			userRole = normalizeRole(userRole)
			for _, role := range allowedRoles {
				if normalizeRole(role) == userRole {
					next.ServeHTTP(w, r)
					return
				}
			}

			response.Error(w, http.StatusForbidden, "FORBIDDEN", "You do not have permission to perform this action")
		})
	}
}

func normalizeRole(role string) string {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "superadmin":
		return "admin"
	case "user":
		// Preserve permissions for accounts created by older releases while
		// new installations use explicit admin/operator/viewer roles.
		return "operator"
	case "admin", "operator", "viewer":
		return strings.ToLower(strings.TrimSpace(role))
	default:
		return "unknown"
	}
}
