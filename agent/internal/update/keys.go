package update

import (
	"crypto/ed25519"
	"encoding/base64"
	"fmt"
)

const releasePublicKeyBase64 = "uleXatf2GtrPtAzlVuMejgUD3NCOm9XYOqN9qTo52qs="

func ReleasePublicKey() (ed25519.PublicKey, error) {
	keyBytes, err := base64.StdEncoding.DecodeString(
		releasePublicKeyBase64,
	)
	if err != nil {
		return nil, fmt.Errorf("decode public key: %w", err)
	}

	if len(keyBytes) != ed25519.PublicKeySize {
		return nil, fmt.Errorf(
			"invalid public key length",
		)
	}

	return ed25519.PublicKey(keyBytes), nil
}