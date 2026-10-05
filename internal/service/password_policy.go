package service

import "strings"

// MinPasswordLength is the minimum length for every account password (admin, agent, affiliator, staff).
const MinPasswordLength = 8

// passwordLongEnough is the one rule every set/reset/change password path uses. Length is counted
// without leading/trailing spaces so a password of only spaces (or padded to reach 8) is rejected,
// but the password itself is stored exactly as typed: login compares the raw value, so trimming
// before hashing would leave the user with a password that never works.
func passwordLongEnough(password string) bool {
	return len(strings.TrimSpace(password)) >= MinPasswordLength
}
