package service

import (
	"context"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"klikumroh/internal/repository"
	"klikumroh/internal/util"
)

// ErrDemoLeadInvalid is returned with a message the visitor can read (what to fix in the demo form).
var ErrDemoLeadInvalid = errors.New("data demo tidak valid")

// DemoLeadInput is what the demo form sends.
type DemoLeadInput struct {
	Name       string
	Phone      string
	TravelName string
	City       string
	Consent    bool
	Source     string
}

// DemoLeadService records who opens the demo dashboard.
type DemoLeadService struct {
	repo repository.DemoLeadRepository
}

// NewDemoLeadService creates the service.
func NewDemoLeadService(repo repository.DemoLeadRepository) *DemoLeadService {
	return &DemoLeadService{repo: repo}
}

type demoFieldError struct{ msg string }

func (e demoFieldError) Error() string { return e.msg }
func (e demoFieldError) Unwrap() error { return ErrDemoLeadInvalid }

func demoFail(msg string) error { return demoFieldError{msg: msg} }

func trimmedLen(s string) int { return utf8.RuneCountInString(strings.TrimSpace(s)) }

// Record validates the form and stores the visit. The WhatsApp number is stored normalized (62...).
func (s *DemoLeadService) Record(ctx context.Context, in DemoLeadInput) error {
	name := strings.Join(strings.Fields(in.Name), " ")
	travel := strings.Join(strings.Fields(in.TravelName), " ")
	city := strings.Join(strings.Fields(in.City), " ")
	switch {
	case trimmedLen(name) < 2 || trimmedLen(name) > 100:
		return demoFail("Nama lengkap wajib diisi (2 sampai 100 karakter).")
	case trimmedLen(travel) < 2 || trimmedLen(travel) > 150:
		return demoFail("Nama travel wajib diisi.")
	case trimmedLen(city) < 2 || trimmedLen(city) > 100:
		return demoFail("Domisili travel wajib diisi.")
	}
	phone := util.NormalizePhoneToWhatsApp(in.Phone)
	digits := len(phone)
	if !strings.HasPrefix(phone, "62") || digits < 10 || digits > 16 || strings.Trim(phone, "0123456789") != "" {
		return demoFail("Nomor WhatsApp tidak valid. Contoh: 081234567890.")
	}
	if !in.Consent {
		return demoFail("Centang persetujuan agar kami boleh menghubungi Anda.")
	}
	var source *string
	if src := strings.TrimSpace(in.Source); src != "" {
		if len(src) > 160 {
			src = src[:160]
		}
		source = &src
	}
	return s.repo.Upsert(ctx, &repository.DemoLead{
		Name: name, Phone: phone, TravelName: travel, City: city, Source: source, ConsentAt: time.Now(),
	})
}

// List returns the demo visitors, most recently active first.
func (s *DemoLeadService) List(ctx context.Context) ([]repository.DemoLead, error) {
	return s.repo.List(ctx, 500)
}
