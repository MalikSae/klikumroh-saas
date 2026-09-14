package service

import (
	"testing"
)

func TestNormalizePhoneToWhatsApp(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"081234567890", "6281234567890"},
		{"0812-3456-7890", "6281234567890"},
		{"+6281234567890", "6281234567890"},
		{"+62 812-3456-7890", "6281234567890"},
		{"6281234567890", "6281234567890"},
		{" 0812 9988 7766 ", "6281299887766"},
		{"", ""},
	}

	for _, tt := range tests {
		result := NormalizePhoneToWhatsApp(tt.input)
		if result != tt.expected {
			t.Errorf("NormalizePhoneToWhatsApp(%q) = %q, expected %q", tt.input, result, tt.expected)
		}
	}
}
