package update

import (
	"context"
	"crypto/ed25519"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

const (
	maxManifestSize  int64 = 256 * 1024 // 256 KB
	maxSignatureSize int64 = 4 * 1024   // 4 KB
)

// Client chịu trách nhiệm tải và xác minh dữ liệu cập nhật Agent.
type Client struct {
	httpClient *http.Client
	publicKey  ed25519.PublicKey
}

// NewClient tạo Update Client với public key chính thức của DatrixOps.
func NewClient(publicKey ed25519.PublicKey) *Client {
	return &Client{
		publicKey: publicKey,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,

			// Không cho phép redirect vô hạn hoặc redirect về HTTP.
			CheckRedirect: func(
				request *http.Request,
				via []*http.Request,
			) error {
				if len(via) >= 3 {
					return fmt.Errorf("too many update redirects")
				}

				if request.URL.Scheme != "https" {
					return fmt.Errorf(
						"update redirect must use HTTPS",
					)
				}

				return nil
			},
		},
	}
}

// FetchManifest tải manifest và chữ ký, xác minh chữ ký trước khi parse JSON.
func (c *Client) FetchManifest(
	ctx context.Context,
	manifestURL string,
	signatureURL string,
) (*Manifest, error) {
	if c == nil {
		return nil, fmt.Errorf("update client is nil")
	}

	if len(c.publicKey) != ed25519.PublicKeySize {
		return nil, fmt.Errorf(
			"invalid release public key length: got %d, expected %d",
			len(c.publicKey),
			ed25519.PublicKeySize,
		)
	}

	manifestBytes, err := c.downloadLimited(
		ctx,
		manifestURL,
		maxManifestSize,
	)
	if err != nil {
		return nil, fmt.Errorf(
			"download release manifest: %w",
			err,
		)
	}

	signatureBytes, err := c.downloadLimited(
		ctx,
		signatureURL,
		maxSignatureSize,
	)
	if err != nil {
		return nil, fmt.Errorf(
			"download release signature: %w",
			err,
		)
	}

	// Phải xác minh raw bytes trước khi parse JSON.
	if err := c.verifyManifest(
		manifestBytes,
		signatureBytes,
	); err != nil {
		return nil, err
	}

	var manifest Manifest

	if err := json.Unmarshal(
		manifestBytes,
		&manifest,
	); err != nil {
		return nil, fmt.Errorf(
			"decode signed release manifest: %w",
			err,
		)
	}

	if err := manifest.Validate(); err != nil {
		return nil, fmt.Errorf(
			"validate signed release manifest: %w",
			err,
		)
	}

	return &manifest, nil
}

// verifyManifest xác minh manifest bằng Ed25519 public key đã nhúng trong Agent.
func (c *Client) verifyManifest(
	manifestBytes []byte,
	signatureBytes []byte,
) error {
	if len(manifestBytes) == 0 {
		return fmt.Errorf("release manifest is empty")
	}

	if len(signatureBytes) != ed25519.SignatureSize {
		return fmt.Errorf(
			"invalid manifest signature length: got %d, expected %d",
			len(signatureBytes),
			ed25519.SignatureSize,
		)
	}

	if !ed25519.Verify(
		c.publicKey,
		manifestBytes,
		signatureBytes,
	) {
		return fmt.Errorf(
			"manifest signature verification failed",
		)
	}

	return nil
}

// downloadLimited tải một file nhưng giới hạn kích thước để tránh dùng quá nhiều RAM.
func (c *Client) downloadLimited(
	ctx context.Context,
	rawURL string,
	maxSize int64,
) ([]byte, error) {
	if err := validateUpdateURL(rawURL); err != nil {
		return nil, err
	}

	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		rawURL,
		nil,
	)
	if err != nil {
		return nil, fmt.Errorf(
			"create update request: %w",
			err,
		)
	}

	request.Header.Set(
		"Accept",
		"application/octet-stream, application/json",
	)
	request.Header.Set(
		"User-Agent",
		"DatrixOps-Agent-Updater",
	)

	response, err := c.httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf(
			"send update request: %w",
			err,
		)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf(
			"unexpected HTTP status: %d %s",
			response.StatusCode,
			response.Status,
		)
	}

	// Từ chối sớm nếu server đã khai báo kích thước quá lớn.
	if response.ContentLength > maxSize {
		return nil, fmt.Errorf(
			"update response is too large: %d bytes, maximum is %d",
			response.ContentLength,
			maxSize,
		)
	}

	reader := io.LimitReader(
		response.Body,
		maxSize+1,
	)

	content, err := io.ReadAll(reader)
	if err != nil {
		return nil, fmt.Errorf(
			"read update response: %w",
			err,
		)
	}

	// +1 ở LimitReader giúp phát hiện response vượt giới hạn.
	if int64(len(content)) > maxSize {
		return nil, fmt.Errorf(
			"update response exceeds maximum size of %d bytes",
			maxSize,
		)
	}

	if len(content) == 0 {
		return nil, fmt.Errorf("update response is empty")
	}

	return content, nil
}

// validateUpdateURL chỉ cho phép URL HTTPS hợp lệ.
func validateUpdateURL(rawURL string) error {
	parsedURL, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf(
			"parse update URL: %w",
			err,
		)
	}

	if parsedURL.Scheme != "https" {
		return fmt.Errorf(
			"update URL must use HTTPS: %s",
			rawURL,
		)
	}

	if parsedURL.Host == "" {
		return fmt.Errorf(
			"update URL is missing host",
		)
	}

	if parsedURL.User != nil {
		return fmt.Errorf(
			"update URL must not contain credentials",
		)
	}

	return nil
}
