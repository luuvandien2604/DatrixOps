package middleware

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/response"
	"golang.org/x/time/rate"
)

// rateLimiter struct holds a map of rate limiters per IP.
type rateLimiter struct {
	ips map[string]*visitor
	mu  sync.Mutex
	r   rate.Limit
	b   int
}

type visitor struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// NewRateLimiter creates a new Rate Limiter middleware.
// r is the rate limit (events per second), b is the burst size.
func NewRateLimiter(r rate.Limit, b int) func(http.Handler) http.Handler {
	limiter := &rateLimiter{
		ips: make(map[string]*visitor),
		r:   r,
		b:   b,
	}

	// Run a background goroutine to clean up old IP entries
	go func() {
		for {
			time.Sleep(time.Minute)
			limiter.mu.Lock()
			for ip, v := range limiter.ips {
				if time.Since(v.lastSeen) > 3*time.Minute {
					delete(limiter.ips, ip)
				}
			}
			limiter.mu.Unlock()
		}
	}()

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			ip := getIP(req)
			l := limiter.getVisitor(ip)

			if !l.Allow() {
				response.Error(w, http.StatusTooManyRequests, "TOO_MANY_REQUESTS", "Rate limit exceeded. Please try again later.")
				return
			}

			next.ServeHTTP(w, req)
		})
	}
}

// getVisitor returns the rate limiter for the given IP address.
func (l *rateLimiter) getVisitor(ip string) *rate.Limiter {
	l.mu.Lock()
	defer l.mu.Unlock()

	v, exists := l.ips[ip]
	if !exists {
		limiter := rate.NewLimiter(l.r, l.b)
		l.ips[ip] = &visitor{limiter, time.Now()}
		return limiter
	}

	v.lastSeen = time.Now()
	return v.limiter
}

// getIP attempts to get the real client IP.
func getIP(r *http.Request) string {
	ip := r.Header.Get("X-Real-IP")
	if ip == "" {
		ip = r.Header.Get("X-Forwarded-For")
	}
	if ip == "" {
		ip = r.RemoteAddr
	}
	// X-Forwarded-For could be a comma-separated list
	if strings.Contains(ip, ",") {
		ip = strings.Split(ip, ",")[0]
	}
	// Remove port from RemoteAddr
	if strings.Contains(ip, ":") && !strings.Contains(ip, "]") {
		ip = strings.Split(ip, ":")[0]
	}
	return strings.TrimSpace(ip)
}
