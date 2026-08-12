package main

import (
	"crypto/ed25519"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"os"
	"strings"

	"github.com/luuvandien2604/DatrixOps/agent/internal/update"
)

func main() {
	encoded := strings.TrimSpace(os.Getenv("AGENT_SIGNING_PRIVATE_KEY"))
	if encoded == "" {
		fail("AGENT_SIGNING_PRIVATE_KEY is missing")
	}
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		raw, err = base64.RawStdEncoding.DecodeString(encoded)
	}
	if err != nil {
		fail("AGENT_SIGNING_PRIVATE_KEY is not valid Base64")
	}

	var privateKey ed25519.PrivateKey
	switch len(raw) {
	case ed25519.SeedSize:
		privateKey = ed25519.NewKeyFromSeed(raw)
	case ed25519.PrivateKeySize:
		privateKey = ed25519.PrivateKey(raw)
	default:
		fail("AGENT_SIGNING_PRIVATE_KEY has an invalid decoded length")
	}

	expected, err := update.ReleasePublicKey()
	if err != nil {
		fail("embedded Agent release public key is invalid")
	}
	actual := privateKey.Public().(ed25519.PublicKey)
	if subtle.ConstantTimeCompare(actual, expected) != 1 {
		fail("signing private key does not match the public key embedded in Agent")
	}
	fmt.Println("Agent release signing key matches the embedded public key.")
}

func fail(message string) {
	fmt.Fprintln(os.Stderr, "ERROR:", message)
	os.Exit(1)
}
