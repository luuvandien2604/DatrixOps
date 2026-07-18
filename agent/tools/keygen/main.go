package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"log"
)

func main() {
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println(
		"PUBLIC_KEY_BASE64=" +
			base64.StdEncoding.EncodeToString(publicKey),
	)

	fmt.Println(
		"PRIVATE_KEY_BASE64=" +
			base64.StdEncoding.EncodeToString(privateKey),
	)
}