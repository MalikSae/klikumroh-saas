package util

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"strings"
	"testing"
)

func TestSecretBoxRoundTrip(t *testing.T) {
	key := make([]byte, 32)
	_, _ = rand.Read(key)
	box, err := NewSecretBox(base64.StdEncoding.EncodeToString(key))
	if err != nil {
		t.Fatalf("new: %v", err)
	}
	sealed, err := box.Seal("EAAB-secret-token")
	if err != nil {
		t.Fatalf("seal: %v", err)
	}
	if strings.Contains(sealed, "secret") {
		t.Fatalf("ciphertext must not contain the plaintext")
	}
	plain, err := box.Open(sealed)
	if err != nil || plain != "EAAB-secret-token" {
		t.Fatalf("open: %q %v", plain, err)
	}
	other, _ := box.Seal("EAAB-secret-token")
	if other == sealed {
		t.Fatalf("each seal must use a fresh nonce")
	}
	if _, err := box.Open(sealed[:len(sealed)-4] + "AAAA"); err == nil {
		t.Fatalf("tampered ciphertext must fail")
	}
}

func TestSecretBoxKeyValidation(t *testing.T) {
	if _, err := NewSecretBox(""); !errors.Is(err, ErrEncryptionKeyMissing) {
		t.Fatalf("empty key: expected ErrEncryptionKeyMissing, got %v", err)
	}
	if _, err := NewSecretBox(base64.StdEncoding.EncodeToString([]byte("short"))); !errors.Is(err, ErrEncryptionKeyInvalid) {
		t.Fatalf("short key: expected ErrEncryptionKeyInvalid, got %v", err)
	}
}
