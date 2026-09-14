package util

import (
	"strings"
	"unicode"
)

// NormalizePhoneToWhatsApp normalizes a phone number to standard WhatsApp format:
// - Strips all non-digit characters except a leading '+'
// - If starts with "0", replaced with "62"
// - If starts with "+62", strips "+", becomes "62"
// - If starts with "62", keeps "62"
// - Returns sanitized digits string without '+', spaces, or hyphens.
func NormalizePhoneToWhatsApp(input string) string {
	input = strings.TrimSpace(input)
	if input == "" {
		return ""
	}

	// Keep only digits and leading '+'
	var sb strings.Builder
	for i, r := range input {
		if i == 0 && r == '+' {
			sb.WriteRune(r)
		} else if unicode.IsDigit(r) {
			sb.WriteRune(r)
		}
	}
	cleaned := sb.String()

	if strings.HasPrefix(cleaned, "+62") {
		return "62" + cleaned[3:]
	}
	if strings.HasPrefix(cleaned, "0") {
		return "62" + cleaned[1:]
	}
	if strings.HasPrefix(cleaned, "62") {
		return cleaned
	}
	if strings.HasPrefix(cleaned, "+") {
		return cleaned[1:]
	}

	return cleaned
}
