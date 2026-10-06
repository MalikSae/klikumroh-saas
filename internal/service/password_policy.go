package service

import (
	"errors"
	"strings"
)

// MinPasswordLength is the minimum length for every account password (admin, agent, affiliator, staff).
const MinPasswordLength = 8

// MaxPasswordBytes is bcrypt's input limit: longer passwords are refused by bcrypt
// (bcrypt.ErrPasswordTooLong), which used to surface as a generic 500.
const MaxPasswordBytes = 72

// ErrPasswordTooLong is matched (errors.Is) by every password-too-long error returned by checkNewPassword.
var ErrPasswordTooLong = errors.New("password terlalu panjang (maksimal 72 karakter; huruf beraksen atau emoji dihitung lebih dari satu)")

// errNewPasswordTooShort is the "too short" error of the agent's own password change and the staff
// reset of a travel admin password (their handlers match its text).
var errNewPasswordTooShort = errors.New("password baru minimal 8 karakter")

// passwordTooLongError reports a too-long password while still matching the module's own "password
// too short" error, so every handler that already answers that error with 400 and err.Error() shows
// this message instead of a 500. errors.Is(err, ErrPasswordTooLong) also matches it.
type passwordTooLongError struct{ base error }

func (e *passwordTooLongError) Error() string        { return ErrPasswordTooLong.Error() }
func (e *passwordTooLongError) Unwrap() error        { return e.base }
func (e *passwordTooLongError) Is(target error) bool { return target == ErrPasswordTooLong }

// passwordLongEnough is the one rule every set/reset/change password path uses. Length is counted
// without leading/trailing spaces so a password of only spaces (or padded to reach 8) is rejected,
// but the password itself is stored exactly as typed: login compares the raw value, so trimming
// before hashing would leave the user with a password that never works.
func passwordLongEnough(password string) bool {
	return len(strings.TrimSpace(password)) >= MinPasswordLength
}

// checkNewPassword applies the whole policy to a password being set: tooShort (the caller's own
// error) when it is too short, a too-long error wrapping tooShort when bcrypt cannot hash it.
func checkNewPassword(password string, tooShort error) error {
	if !passwordLongEnough(password) {
		return tooShort
	}
	if len(password) > MaxPasswordBytes {
		return &passwordTooLongError{base: tooShort}
	}
	return nil
}
