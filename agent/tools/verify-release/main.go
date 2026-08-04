package main

import (
	"flag"
	"fmt"
	"os"

	agentupdate "github.com/luuvandien2604/DatrixOps/agent/internal/update"
)

func main() {
	releaseDir := flag.String("release-dir", "", "directory containing manifest.sig, manifest.json, and Agent binaries")
	version := flag.String("version", "", "expected Agent release version")
	flag.Parse()

	if *releaseDir == "" || *version == "" {
		fmt.Fprintln(os.Stderr, "verify release: --release-dir and --version are required")
		os.Exit(2)
	}
	publicKey, err := agentupdate.ReleasePublicKey()
	if err == nil {
		_, err = agentupdate.VerifyReleaseDirectory(*releaseDir, *version, publicKey)
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "verify release: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Verified signed DatrixOps Agent release %s (%d artifacts)\n", *version, len(agentupdate.RequiredReleaseTargets))
}
