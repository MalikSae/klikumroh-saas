package service

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// BannerOrphanMinAge is how old an unused banner image must be before it is removed. A banner image is
// uploaded as soon as the admin picks it, before the banner is saved, so a fresh file may still be
// waiting for its banner; a day is far longer than any open banner form.
const BannerOrphanMinAge = 24 * time.Hour

// SweepOrphanBannerFiles deletes banner images that no banner uses any more: uploads from a banner form
// that was cancelled, images replaced before saving, and files left by older versions. It walks
// <uploadsRoot>/<tenantID>/banners per tenant and compares with that tenant's own banners (tenant-scoped
// read). When a tenant's banners cannot be read the tenant is skipped: nothing is deleted on doubt.
func SweepOrphanBannerFiles(ctx context.Context, content ContentService, uploadsRoot string, minAge time.Duration, now time.Time) (int, error) {
	tenantDirs, err := os.ReadDir(uploadsRoot)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, err
	}
	removed := 0
	for _, td := range tenantDirs {
		if !td.IsDir() {
			continue
		}
		tenantID, err := strconv.ParseUint(td.Name(), 10, 64)
		if err != nil {
			continue
		}
		dir := filepath.Join(uploadsRoot, td.Name(), "banners")
		files, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		banners, err := content.ListBanners(ctx, tenantID, false)
		if err != nil {
			log.Printf("[Banner] sweep: skip tenant %d, cannot read banners: %v", tenantID, err)
			continue
		}
		prefix := fmt.Sprintf("/uploads/%d/banners/", tenantID)
		used := make(map[string]bool, len(banners))
		for _, b := range banners {
			if strings.HasPrefix(b.ImageURL, prefix) {
				used[strings.TrimPrefix(b.ImageURL, prefix)] = true
			}
		}
		for _, f := range files {
			if f.IsDir() || used[f.Name()] {
				continue
			}
			info, err := f.Info()
			if err != nil || now.Sub(info.ModTime()) < minAge {
				continue
			}
			if err := os.Remove(filepath.Join(dir, f.Name())); err == nil {
				removed++
			}
		}
	}
	return removed, nil
}

// SweepOrphanTestimonialPhotos does the same for testimonial photos (<uploadsRoot>/<tenantID>/testimonials):
// a photo is uploaded when the admin picks it, before the testimonial is saved.
func SweepOrphanTestimonialPhotos(ctx context.Context, content ContentService, uploadsRoot string, minAge time.Duration, now time.Time) (int, error) {
	tenantDirs, err := os.ReadDir(uploadsRoot)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, err
	}
	removed := 0
	for _, td := range tenantDirs {
		if !td.IsDir() {
			continue
		}
		tenantID, err := strconv.ParseUint(td.Name(), 10, 64)
		if err != nil {
			continue
		}
		dir := filepath.Join(uploadsRoot, td.Name(), "testimonials")
		files, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		items, err := content.ListTestimonials(ctx, tenantID, false)
		if err != nil {
			log.Printf("[Testimonial] sweep: skip tenant %d, cannot read testimonials: %v", tenantID, err)
			continue
		}
		prefix := fmt.Sprintf("/uploads/%d/testimonials/", tenantID)
		used := make(map[string]bool, len(items))
		for _, t := range items {
			if t.AvatarURL != nil && strings.HasPrefix(*t.AvatarURL, prefix) {
				used[strings.TrimPrefix(*t.AvatarURL, prefix)] = true
			}
		}
		for _, f := range files {
			if f.IsDir() || used[f.Name()] {
				continue
			}
			info, err := f.Info()
			if err != nil || now.Sub(info.ModTime()) < minAge {
				continue
			}
			if err := os.Remove(filepath.Join(dir, f.Name())); err == nil {
				removed++
			}
		}
	}
	return removed, nil
}

// StartBannerFileSweep runs SweepOrphanBannerFiles (and the testimonial photo sweep) shortly after start
// and then every interval.
func StartBannerFileSweep(ctx context.Context, content ContentService, uploadsRoot string, interval time.Duration) {
	go func() {
		run := func() {
			n, err := SweepOrphanBannerFiles(ctx, content, uploadsRoot, BannerOrphanMinAge, time.Now())
			if err != nil {
				log.Printf("[Banner] sweep failed: %v", err)
				return
			}
			if n > 0 {
				log.Printf("[Banner] sweep: removed %d unused banner images", n)
			}
			if t, err := SweepOrphanTestimonialPhotos(ctx, content, uploadsRoot, BannerOrphanMinAge, time.Now()); err != nil {
				log.Printf("[Testimonial] sweep failed: %v", err)
			} else if t > 0 {
				log.Printf("[Testimonial] sweep: removed %d unused photos", t)
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Minute):
			run()
		}
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				run()
			}
		}
	}()
}
