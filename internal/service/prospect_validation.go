package service

import (
	"errors"
	"fmt"
	"net/mail"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"klikumroh/internal/util"
)

// Input limits for prospects. They keep bad input a 400 (not a database 500) and stop absurd values
// (e.g. 100000 jamaah) from turning into absurd commissions.
const (
	MaxProspectNameLength   = 100
	MaxProspectEmailLength  = 255
	MaxProspectJumlahJamaah = 50
	MaxProspectNoteLength   = 2000
	MaxLostReasonLength     = 255
)

var (
	ErrInvalidProspectName    = errors.New("nama wajib diisi (2-100 karakter)")
	ErrInvalidProspectPhone   = errors.New("nomor WhatsApp tidak valid (10-15 digit angka, contoh: 081234567890)")
	ErrInvalidProspectEmail   = errors.New("format email tidak valid")
	ErrJumlahJamaahTooLarge   = errors.New("jumlah jamaah maksimal 50 orang per pendaftaran")
	ErrLostReasonTooLong      = errors.New("alasan tidak lanjut maksimal 255 karakter")
	ErrNoteTooLong            = errors.New("catatan maksimal 2000 karakter")
	ErrTenantServiceSuspended = errors.New("layanan pendaftaran sementara tidak aktif karena masa layanan biro travel sedang ditangguhkan")
)

var normalizedPhonePattern = regexp.MustCompile(`^62[0-9]{8,13}$`)

// validateProspectName trims the name and checks its length (in characters, not bytes).
func validateProspectName(raw string) (string, error) {
	name := strings.Join(strings.Fields(raw), " ")
	if name == "" {
		return "", ErrProspectNameRequired
	}
	n := utf8.RuneCountInString(name)
	if n < 2 || n > MaxProspectNameLength {
		return "", ErrInvalidProspectName
	}
	return name, nil
}

// validateProspectPhone returns the phone as stored (digits, optional leading +) and its normalized
// 62xxxxxxxxx form used to find the same jamaah again. Spaces, dashes, dots and brackets are allowed
// in the input; letters are not.
func validateProspectPhone(raw string) (clean string, normalized string, err error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", "", ErrProspectPhoneRequired
	}
	var sb strings.Builder
	for i, r := range s {
		switch {
		case r >= '0' && r <= '9':
			sb.WriteRune(r)
		case r == '+' && i == 0:
			sb.WriteRune(r)
		case r == ' ' || r == '-' || r == '.' || r == '(' || r == ')':
			// formatting characters, dropped
		default:
			return "", "", ErrInvalidProspectPhone
		}
	}
	clean = sb.String()
	normalized = util.NormalizePhoneToWhatsApp(clean)
	if !normalizedPhonePattern.MatchString(normalized) {
		return "", "", ErrInvalidProspectPhone
	}
	return clean, normalized, nil
}

// validateProspectEmail accepts an empty value (email is optional).
func validateProspectEmail(raw *string) (*string, error) {
	if raw == nil {
		return nil, nil
	}
	email := strings.TrimSpace(*raw)
	if email == "" {
		return nil, nil
	}
	if len(email) > MaxProspectEmailLength {
		return nil, ErrInvalidProspectEmail
	}
	addr, err := mail.ParseAddress(email)
	if err != nil || addr.Address != email {
		return nil, ErrInvalidProspectEmail
	}
	return &email, nil
}

func validateJumlahJamaah(v *int) error {
	if v == nil {
		return nil
	}
	if *v <= 0 {
		return ErrInvalidJumlahJamaah
	}
	if *v > MaxProspectJumlahJamaah {
		return ErrJumlahJamaahTooLarge
	}
	return nil
}

// cleanLostReason keeps the reason only for 'tidak_lanjut' and enforces the column length.
func cleanLostReason(status string, reason *string) (*string, error) {
	if status != "tidak_lanjut" || reason == nil {
		return nil, nil
	}
	trimmed := strings.TrimSpace(*reason)
	if trimmed == "" {
		return nil, nil
	}
	if utf8.RuneCountInString(trimmed) > MaxLostReasonLength {
		return nil, ErrLostReasonTooLong
	}
	return &trimmed, nil
}

func validateNoteText(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", errors.New("catatan tidak boleh kosong")
	}
	if utf8.RuneCountInString(trimmed) > MaxProspectNoteLength {
		return "", ErrNoteTooLong
	}
	return trimmed, nil
}

// ProspectAttribution is the ad/campaign data the public site captured when the visitor landed.
type ProspectAttribution struct {
	UTMSource   string `json:"utm_source"`
	UTMMedium   string `json:"utm_medium"`
	UTMCampaign string `json:"utm_campaign"`
	Fbclid      string `json:"fbclid"`
}

// paidUTMMediums are utm_medium values that mean the visit came from a paid ad.
var paidUTMMediums = map[string]bool{
	"cpc": true, "ppc": true, "cpm": true, "paid": true, "ads": true, "ad": true,
	"paid_social": true, "paidsocial": true, "paid-social": true, "social_paid": true,
}

// isPaid reports whether the visit came from an ad: a Meta click id (fbclid, set by Meta on every ad
// click and later reused by Pixel/CAPI) or a paid utm_medium.
func (a ProspectAttribution) isPaid() bool {
	if strings.TrimSpace(a.Fbclid) != "" {
		return true
	}
	return paidUTMMediums[strings.ToLower(strings.TrimSpace(a.UTMMedium))]
}

func truncatedPtr(v string, max int) *string {
	v = strings.TrimSpace(v)
	if v == "" {
		return nil
	}
	if len(v) > max {
		// cut on a rune boundary
		for max > 0 && !utf8.RuneStart(v[max]) {
			max--
		}
		v = v[:max]
	}
	return &v
}

// LostReasonCategories are the fixed reasons for 'Tidak Lanjut' (keputusan pendiri 29 Sep 2026), so the
// travel can see why it loses jamaah. "batal_setelah_dp" is set by Batalkan Closing only.
var LostReasonCategories = map[string]string{
	"harga":            "Harga tidak cocok",
	"jadwal":           "Jadwal tidak cocok",
	"dana":             "Dana belum siap",
	"travel_lain":      "Memilih travel lain",
	"tidak_respons":    "Tidak merespons",
	"batal_setelah_dp": "Batal setelah DP",
	"lainnya":          "Lainnya",
}

var (
	ErrLostReasonCategoryInvalid = errors.New("pilih alasan tidak lanjut: harga, jadwal, dana, travel lain, tidak merespons, atau lainnya")
	ErrLostReasonDetailRequired  = errors.New("jelaskan alasan tidak lanjut untuk pilihan Lainnya")
	ErrConsentRequired           = errors.New("centang persetujuan agar tim travel boleh menghubungi Anda")
	ErrAgentConsentRequired      = errors.New("konfirmasi bahwa calon jamaah sudah setuju dihubungi oleh travel")
	ErrInvalidDeparturePlan      = errors.New("rencana keberangkatan tidak valid (pilih bulan dalam 3 tahun ke depan)")
	ErrInvalidDomicile           = errors.New("domisili maksimal 100 karakter")
	ErrPhoneUsedByOpenProspect   = errors.New("nomor WhatsApp ini sudah dipakai prospek lain yang masih diproses")
)

// cleanLostReasonWithCategory validates the 'Tidak Lanjut' reason. The category is required; for
// older clients that only send a free-text reason, the category falls back to "lainnya".
func cleanLostReasonWithCategory(status string, reason, category *string, allowSystem bool) (*string, *string, error) {
	if status != "tidak_lanjut" {
		return nil, nil, nil
	}
	detail, err := cleanLostReason(status, reason)
	if err != nil {
		return nil, nil, err
	}
	cat := ""
	if category != nil {
		cat = strings.ToLower(strings.TrimSpace(*category))
	}
	if cat == "" {
		if detail == nil {
			return nil, nil, ErrLostReasonCategoryInvalid
		}
		cat = "lainnya"
	}
	if _, ok := LostReasonCategories[cat]; !ok || (cat == "batal_setelah_dp" && !allowSystem) {
		return nil, nil, ErrLostReasonCategoryInvalid
	}
	if cat == "lainnya" && detail == nil {
		return nil, nil, ErrLostReasonDetailRequired
	}
	if detail == nil {
		label := LostReasonCategories[cat]
		detail = &label
	}
	return detail, &cat, nil
}

var departurePlanPattern = regexp.MustCompile(`^[0-9]{4}-(0[1-9]|1[0-2])$`)

// validateDeparturePlan accepts "YYYY-MM" from the current month up to 3 years ahead, or empty.
func validateDeparturePlan(raw *string) (*string, error) {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return nil, nil
	}
	v := strings.TrimSpace(*raw)
	if !departurePlanPattern.MatchString(v) {
		return nil, ErrInvalidDeparturePlan
	}
	now := time.Now().In(time.FixedZone("WIB", 7*60*60))
	current := fmt.Sprintf("%04d-%02d", now.Year(), int(now.Month()))
	limit := fmt.Sprintf("%04d-%02d", now.Year()+3, int(now.Month()))
	if v < current || v > limit {
		return nil, ErrInvalidDeparturePlan
	}
	return &v, nil
}

// trimmedPtr returns nil for nil/blank values, otherwise the trimmed value.
func trimmedPtr(raw *string) *string {
	if raw == nil {
		return nil
	}
	v := strings.TrimSpace(*raw)
	if v == "" {
		return nil
	}
	return &v
}

func validateDomicile(raw *string) (*string, error) {
	if raw == nil {
		return nil, nil
	}
	v := strings.Join(strings.Fields(*raw), " ")
	if v == "" {
		return nil, nil
	}
	if utf8.RuneCountInString(v) > 100 {
		return nil, ErrInvalidDomicile
	}
	return &v, nil
}

var indonesianMonths = []string{"Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"}

// formatDeparturePlanLabel turns "2026-12" into "Desember 2026" for notes.
func formatDeparturePlanLabel(plan string) string {
	t, err := time.Parse("2006-01", plan)
	if err != nil {
		return plan
	}
	return fmt.Sprintf("%s %d", indonesianMonths[t.Month()-1], t.Year())
}

// humanLostReasonCategory is the label for CSV/UI.
func humanLostReasonCategory(category *string) string {
	if category == nil {
		return ""
	}
	if label, ok := LostReasonCategories[*category]; ok {
		return label
	}
	return *category
}

// humanProspectStatus is the label shown to people (notifications, CSV); the stored value stays the key.
func humanProspectStatus(status string) string {
	switch status {
	case "baru":
		return "Baru"
	case "dihubungi":
		return "Dihubungi"
	case "tertarik":
		return "Tertarik"
	case "closing":
		return "Closing"
	case "tidak_lanjut":
		return "Tidak Lanjut"
	default:
		return status
	}
}

// truncate is truncatedPtr for plain strings ("" stays "").
func truncate(v string, max int) string {
	if p := truncatedPtr(v, max); p != nil {
		return *p
	}
	return ""
}
