package util

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"io"
	"strings"
)

// ErrEncryptionKeyMissing is returned when APP_ENCRYPTION_KEY is not configured on the server.
var ErrEncryptionKeyMissing = errors.New("kunci enkripsi server (APP_ENCRYPTION_KEY) belum dikonfigurasi")

// ErrEncryptionKeyInvalid is returned when APP_ENCRYPTION_KEY is not 32 bytes of base64.
var ErrEncryptionKeyInvalid = errors.New("APP_ENCRYPTION_KEY harus 32 byte dalam format base64")

// SecretBox encrypts small secrets (third-party access tokens) with AES-256-GCM before they are
// stored in the database. The ciphertext is base64(nonce || sealed).
type SecretBox struct {
	aead cipher.AEAD
}

// NewSecretBox builds a SecretBox from a base64-encoded 32-byte key. An empty key returns
// ErrEncryptionKeyMissing so callers can refuse to store secrets rather than store them in plain text.
func NewSecretBox(base64Key string) (*SecretBox, error) {
	base64Key = strings.TrimSpace(base64Key)
	if base64Key == "" {
		return nil, ErrEncryptionKeyMissing
	}
	key, err := base64.StdEncoding.DecodeString(base64Key)
	if err != nil || len(key) != 32 {
		return nil, ErrEncryptionKeyInvalid
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &SecretBox{aead: aead}, nil
}

// Seal encrypts plaintext.
func (b *SecretBox) Seal(plaintext string) (string, error) {
	nonce := make([]byte, b.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := b.aead.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(sealed), nil
}

// Open decrypts a value produced by Seal.
func (b *SecretBox) Open(ciphertext string) (string, error) {
	raw, err := base64.StdEncoding.DecodeString(ciphertext)
	if err != nil {
		return "", err
	}
	n := b.aead.NonceSize()
	if len(raw) < n {
		return "", errors.New("ciphertext terlalu pendek")
	}
	plain, err := b.aead.Open(nil, raw[:n], raw[n:], nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}
