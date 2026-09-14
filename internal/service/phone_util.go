package service

import (
	"klikumroh/internal/util"
)

// NormalizePhoneToWhatsApp normalizes a phone number to standard WhatsApp format.
func NormalizePhoneToWhatsApp(input string) string {
	return util.NormalizePhoneToWhatsApp(input)
}
