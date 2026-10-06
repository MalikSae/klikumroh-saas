package service

import (
	"context"
	"errors"
	"strings"
	"testing"
)

// Bug hunt round 4 (LOW), service-only checks (no database).

// L8: a password over bcrypt's 72-byte limit is a friendly validation error that still matches the
// module's own "too short" error, so every handler answers 400 instead of a generic 500.
func TestBH4_PasswordTooLong(t *testing.T) {
	cases := []struct {
		name string
		pwd  string
		want error
	}{
		{"short", "abc", ErrPasswordTooShort},
		{"padded short", "   abc     ", ErrPasswordTooShort},
		{"ok", "rahasia-test-123", nil},
		{"exactly 72 bytes", strings.Repeat("a", 72), nil},
		{"73 bytes", strings.Repeat("a", 73), ErrPasswordTooLong},
		{"multibyte over 72 bytes", strings.Repeat("é", 37), ErrPasswordTooLong}, // 74 bytes
	}
	for _, c := range cases {
		err := checkNewPassword(c.pwd, ErrPasswordTooShort)
		if c.want == nil {
			if err != nil {
				t.Errorf("%s: want nil, got %v", c.name, err)
			}
			continue
		}
		if !errors.Is(err, c.want) {
			t.Errorf("%s: want %v, got %v", c.name, c.want, err)
		}
		if c.want == ErrPasswordTooLong {
			if !errors.Is(err, ErrPasswordTooShort) {
				t.Errorf("%s: too-long must still match the caller's too-short error (400 mapping)", c.name)
			}
			if err.Error() != ErrPasswordTooLong.Error() {
				t.Errorf("%s: message = %q", c.name, err.Error())
			}
		}
	}
	// The module-specific errors keep working the same way.
	if err := checkNewPassword(strings.Repeat("x", 80), ErrStaffPasswordTooShort); !errors.Is(err, ErrStaffPasswordTooShort) || !errors.Is(err, ErrPasswordTooLong) {
		t.Errorf("staff: got %v", err)
	}
}

// SEO fields over their column length are refused (400) before any database write.
func TestBH4_SEOFieldLengths(t *testing.T) {
	s := &tenantService{} // no repository: validation must return before it is used
	long := func(n int) *string { v := strings.Repeat("a", n); return &v }
	cases := []struct {
		city, province, title, desc, keywords *string
		want                                  error
	}{
		{city: long(101), want: ErrSEOCityTooLong},
		{province: long(101), want: ErrSEOProvinceTooLong},
		{title: long(256), want: ErrSEOMetaTitleTooLong},
		{desc: long(501), want: ErrSEOMetaDescriptionTooLong},
		{keywords: long(256), want: ErrSEOMetaKeywordsTooLong},
	}
	for _, c := range cases {
		_, err := s.UpdateSEOGeo(context.Background(), 1, c.city, c.province, c.title, c.desc, c.keywords)
		if !errors.Is(err, c.want) || !IsSEOInputError(err) {
			t.Errorf("want %v, got %v", c.want, err)
		}
	}
	// Multibyte text is counted in characters, like the VARCHAR column: 255 x "é" is allowed.
	title := strings.Repeat("é", 255)
	func() {
		defer func() { _ = recover() }() // the nil repository panics once validation passed
		_, err := s.UpdateSEOGeo(context.Background(), 1, nil, nil, &title, nil, nil)
		if IsSEOInputError(err) {
			t.Errorf("255 characters must pass validation, got %v", err)
		}
	}()
}

// The system 'Tidak Lanjut' categories are never accepted from a person.
func TestBH4_SystemLostCategoriesNotSelectable(t *testing.T) {
	for _, cat := range []string{"batal_setelah_dp", "data_dihapus"} {
		c := cat
		if _, _, err := cleanLostReasonWithCategory("tidak_lanjut", nil, &c, false); !errors.Is(err, ErrLostReasonCategoryInvalid) {
			t.Errorf("%s: want ErrLostReasonCategoryInvalid, got %v", cat, err)
		}
	}
	if label := humanLostReasonCategory(strPtrBH4("data_dihapus")); label != "Data dihapus (UU PDP)" {
		t.Errorf("label = %q", label)
	}
}

func strPtrBH4(s string) *string { return &s }
