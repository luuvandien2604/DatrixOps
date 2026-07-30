package scheduler

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestProbeWebsiteValidTLS(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	}))
	defer server.Close()

	result := probeWebsiteWithClient(context.Background(), server.URL, trustedTestClient(t, server), time.Now())
	if result.status != "UP" {
		t.Fatalf("expected UP, got status=%s failure=%s", result.status, result.failureKind)
	}
	if result.sslValidTo == nil {
		t.Fatal("expected TLS certificate metadata")
	}
	if result.statusCode == nil || *result.statusCode != http.StatusOK {
		t.Fatalf("expected HTTP 200 metadata, got %v", result.statusCode)
	}
}

func TestProbeWebsiteHTTP500(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "nope", http.StatusInternalServerError)
	}))
	defer server.Close()

	result := probeWebsiteWithClient(context.Background(), server.URL, server.Client(), time.Now())
	if result.status != "DOWN" || result.failureKind != "http_status_error" {
		t.Fatalf("expected HTTP status failure, got status=%s failure=%s", result.status, result.failureKind)
	}
}

func TestProbeWebsiteRejectsSelfSignedTLS(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	}))
	defer server.Close()

	result := probeWebsiteWithClient(context.Background(), server.URL, &http.Client{Timeout: time.Second}, time.Now())
	if result.status != "DOWN" || result.failureKind != "tls_untrusted_chain" {
		t.Fatalf("expected untrusted TLS failure, got status=%s failure=%s", result.status, result.failureKind)
	}
}

func TestProbeWebsiteDetectsHostnameMismatch(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	}))
	defer server.Close()

	pool := x509.NewCertPool()
	for _, cert := range server.TLS.Certificates {
		leaf, err := x509.ParseCertificate(cert.Certificate[0])
		if err != nil {
			t.Fatalf("parse test certificate: %v", err)
		}
		pool.AddCert(leaf)
	}

	target, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("parse test server URL: %v", err)
	}
	target.Host = net.JoinHostPort("wrong.invalid", target.Port())
	serverAddress := server.Listener.Addr().String()
	client := &http.Client{
		Timeout: time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				RootCAs: pool,
			},
			DialContext: func(ctx context.Context, network, _ string) (net.Conn, error) {
				return (&net.Dialer{}).DialContext(ctx, network, serverAddress)
			},
		},
	}
	result := probeWebsiteWithClient(context.Background(), target.String(), client, time.Now())
	if result.status != "DOWN" || result.failureKind != "tls_hostname_mismatch" {
		t.Fatalf("expected hostname mismatch, got status=%s failure=%s", result.status, result.failureKind)
	}
}

func trustedTestClient(t *testing.T, server *httptest.Server) *http.Client {
	t.Helper()
	pool := x509.NewCertPool()
	for _, cert := range server.TLS.Certificates {
		leaf, err := x509.ParseCertificate(cert.Certificate[0])
		if err != nil {
			t.Fatalf("parse test certificate: %v", err)
		}
		pool.AddCert(leaf)
	}
	return &http.Client{
		Timeout: time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{RootCAs: pool},
		},
	}
}

func TestProbeWebsiteDetectsExpiredTLS(t *testing.T) {
	cert, certPool := mustExpiredCertificate(t)
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	}))
	server.TLS = &tls.Config{Certificates: []tls.Certificate{cert}}
	server.StartTLS()
	defer server.Close()

	client := &http.Client{
		Timeout: time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				RootCAs:    certPool,
				ServerName: "expired.example.com",
			},
		},
	}
	result := probeWebsiteWithClient(context.Background(), server.URL, client, time.Now())
	if result.status != "DOWN" || result.failureKind != "tls_certificate_expired_or_not_yet_valid" {
		t.Fatalf("expected expired TLS failure, got status=%s failure=%s", result.status, result.failureKind)
	}
}

func TestProbeWebsiteTimeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		time.Sleep(200 * time.Millisecond)
		_, _ = w.Write([]byte("late"))
	}))
	defer server.Close()

	client := &http.Client{Timeout: 20 * time.Millisecond}
	result := probeWebsiteWithClient(context.Background(), server.URL, client, time.Now())
	if result.status != "DOWN" || result.failureKind != "timeout" {
		t.Fatalf("expected timeout, got status=%s failure=%s", result.status, result.failureKind)
	}
}

func TestProbeWebsiteRedirectLoop(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, r.URL.String(), http.StatusFound)
	}))
	defer server.Close()

	result := probeWebsiteWithClient(context.Background(), server.URL, server.Client(), time.Now())
	if result.status != "DOWN" || result.failureKind != "redirect_loop" {
		t.Fatalf("expected redirect loop, got status=%s failure=%s", result.status, result.failureKind)
	}
}

func mustExpiredCertificate(t *testing.T) (tls.Certificate, *x509.CertPool) {
	t.Helper()

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}

	template := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject: pkix.Name{
			CommonName: "expired.example.com",
		},
		NotBefore:   time.Now().Add(-48 * time.Hour),
		NotAfter:    time.Now().Add(-24 * time.Hour),
		DNSNames:    []string{"expired.example.com"},
		KeyUsage:    x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}

	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("create certificate: %v", err)
	}

	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})
	cert, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		t.Fatalf("load key pair: %v", err)
	}

	parsed, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatalf("parse certificate: %v", err)
	}
	pool := x509.NewCertPool()
	pool.AddCert(parsed)
	if !strings.Contains(parsed.Subject.CommonName, "expired.example.com") {
		t.Fatalf("unexpected certificate subject: %s", parsed.Subject.CommonName)
	}
	return cert, pool
}
