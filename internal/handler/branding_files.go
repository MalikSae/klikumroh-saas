package handler

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// brandingSlot is one of the tenant's replaceable branding images (all stored in uploads/<tenant>/branding).
type brandingSlot int

const (
	brandingLogo brandingSlot = iota
	brandingIcon
	brandingOGImage
)

// currentBrandingURL returns the image URL stored for the slot right now, or "" when there is none.
func (h *TenantHandler) currentBrandingURL(ctx context.Context, tenantID uint64, slot brandingSlot) string {
	var url *string
	switch slot {
	case brandingLogo, brandingIcon:
		p, err := h.tenantService.GetProfile(ctx, tenantID)
		if err != nil || p == nil {
			return ""
		}
		url = p.BrandLogoURL
		if slot == brandingIcon {
			url = p.BrandIconURL
		}
	case brandingOGImage:
		s, err := h.tenantService.GetSEOGeo(ctx, tenantID)
		if err != nil || s == nil {
			return ""
		}
		url = s.OGImageURL
	}
	if url == nil {
		return ""
	}
	return *url
}

// removeBrandingFile deletes a replaced or removed branding image from disk. It only touches files in
// this tenant's own branding folder, so a URL pointing anywhere else (another tenant, an external
// host, a path with "..") is left alone.
func removeBrandingFile(tenantID uint64, url string) {
	prefix := fmt.Sprintf("/uploads/%d/branding/", tenantID)
	if !strings.HasPrefix(url, prefix) {
		return
	}
	name := strings.TrimPrefix(url, prefix)
	if name == "" || name != filepath.Base(name) || strings.Contains(name, "..") {
		return
	}
	_ = os.Remove(filepath.Join(".", "uploads", fmt.Sprintf("%d", tenantID), "branding", name))
}
