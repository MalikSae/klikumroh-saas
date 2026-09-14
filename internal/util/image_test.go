package util_test

import (
	"bytes"
	"errors"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"

	"klikumroh/internal/util"
)

func TestConvertAndSaveWebP(t *testing.T) {
	// 1. Create a dummy PNG image
	img := image.NewRGBA(image.Rect(0, 0, 1800, 900))
	for y := 0; y < 900; y++ {
		for x := 0; x < 1800; x++ {
			img.Set(x, y, color.RGBA{R: 0, G: 128, B: 255, A: 255})
		}
	}
	var pngBuf bytes.Buffer
	if err := png.Encode(&pngBuf, img); err != nil {
		t.Fatalf("failed to encode dummy png: %v", err)
	}

	tmpDir := t.TempDir()
	destPath := filepath.Join(tmpDir, "test-output.webp")

	t.Run("Valid PNG converts and resizes down to maxWidth WebP successfully", func(t *testing.T) {
		err := util.ConvertAndSaveWebP(pngBuf.Bytes(), destPath, 1600, 80)
		if err != nil {
			t.Fatalf("ConvertAndSaveWebP failed: %v", err)
		}

		info, err := os.Stat(destPath)
		if err != nil {
			t.Fatalf("output file does not exist: %v", err)
		}
		if info.Size() == 0 {
			t.Errorf("output file is empty")
		}
	})

	t.Run("Invalid file format returns ErrInvalidImageFormat", func(t *testing.T) {
		plainText := []byte("this is plain text not an image")
		err := util.ConvertAndSaveWebP(plainText, filepath.Join(tmpDir, "bad.webp"), 1600, 80)
		if err == nil {
			t.Fatal("expected error for plain text, got nil")
		}
		if !errors.Is(err, util.ErrInvalidImageFormat) {
			t.Errorf("expected ErrInvalidImageFormat, got %v", err)
		}
	})
}

func TestConvertAndSavePNGIcon(t *testing.T) {
	// Create rectangle test image (e.g. 800x400)
	img := image.NewRGBA(image.Rect(0, 0, 800, 400))
	for y := 0; y < 400; y++ {
		for x := 0; x < 800; x++ {
			img.Set(x, y, color.RGBA{R: 235, G: 162, B: 36, A: 255})
		}
	}
	var pngBuf bytes.Buffer
	if err := png.Encode(&pngBuf, img); err != nil {
		t.Fatalf("failed to encode dummy png: %v", err)
	}

	tmpDir := t.TempDir()
	iconPath := filepath.Join(tmpDir, "icon.png")

	t.Run("Crops to 1:1 square PNG of specified size", func(t *testing.T) {
		err := util.ConvertAndSavePNGIcon(pngBuf.Bytes(), iconPath, 256)
		if err != nil {
			t.Fatalf("ConvertAndSavePNGIcon failed: %v", err)
		}

		f, err := os.Open(iconPath)
		if err != nil {
			t.Fatalf("failed to open output icon: %v", err)
		}
		defer f.Close()

		cfg, format, err := image.DecodeConfig(f)
		if err != nil {
			t.Fatalf("failed to decode icon config: %v", err)
		}
		if format != "png" {
			t.Errorf("expected format 'png', got %s", format)
		}
		if cfg.Width != 256 || cfg.Height != 256 {
			t.Errorf("expected 256x256, got %dx%d", cfg.Width, cfg.Height)
		}
	})

	t.Run("Invalid file format returns ErrInvalidImageFormat", func(t *testing.T) {
		err := util.ConvertAndSavePNGIcon([]byte("not an image"), filepath.Join(tmpDir, "bad.png"), 256)
		if !errors.Is(err, util.ErrInvalidImageFormat) {
			t.Errorf("expected ErrInvalidImageFormat, got %v", err)
		}
	})
}

func TestConvertAndSavePNGLogo(t *testing.T) {
	// Create wide logo image (1200x300)
	img := image.NewRGBA(image.Rect(0, 0, 1200, 300))
	for y := 0; y < 300; y++ {
		for x := 0; x < 1200; x++ {
			img.Set(x, y, color.RGBA{R: 15, G: 23, B: 42, A: 200}) // semi-transparent
		}
	}
	var pngBuf bytes.Buffer
	if err := png.Encode(&pngBuf, img); err != nil {
		t.Fatalf("failed to encode dummy png: %v", err)
	}

	tmpDir := t.TempDir()
	logoPath := filepath.Join(tmpDir, "logo.png")

	t.Run("Resizes down to maxWidth 600 while maintaining aspect ratio and PNG format", func(t *testing.T) {
		err := util.ConvertAndSavePNGLogo(pngBuf.Bytes(), logoPath, 600)
		if err != nil {
			t.Fatalf("ConvertAndSavePNGLogo failed: %v", err)
		}

		f, err := os.Open(logoPath)
		if err != nil {
			t.Fatalf("failed to open output logo: %v", err)
		}
		defer f.Close()

		cfg, format, err := image.DecodeConfig(f)
		if err != nil {
			t.Fatalf("failed to decode logo config: %v", err)
		}
		if format != "png" {
			t.Errorf("expected format 'png', got %s", format)
		}
		if cfg.Width != 600 {
			t.Errorf("expected width 600, got %d", cfg.Width)
		}
		if cfg.Height != 150 {
			t.Errorf("expected height 150, got %d", cfg.Height)
		}
	})
}

func TestConvertAndSavePNGOGImage(t *testing.T) {
	// Create large banner image (2400x1200)
	img := image.NewRGBA(image.Rect(0, 0, 2400, 1200))
	for y := 0; y < 1200; y++ {
		for x := 0; x < 2400; x++ {
			img.Set(x, y, color.RGBA{R: 30, G: 64, B: 175, A: 255})
		}
	}
	var pngBuf bytes.Buffer
	if err := png.Encode(&pngBuf, img); err != nil {
		t.Fatalf("failed to encode dummy png: %v", err)
	}

	tmpDir := t.TempDir()
	ogPath := filepath.Join(tmpDir, "og.png")

	t.Run("Resizes down to fit maxWidth 1200 and maxHeight 630 proportionally", func(t *testing.T) {
		err := util.ConvertAndSavePNGOGImage(pngBuf.Bytes(), ogPath, 1200, 630)
		if err != nil {
			t.Fatalf("ConvertAndSavePNGOGImage failed: %v", err)
		}

		f, err := os.Open(ogPath)
		if err != nil {
			t.Fatalf("failed to open output og image: %v", err)
		}
		defer f.Close()

		cfg, format, err := image.DecodeConfig(f)
		if err != nil {
			t.Fatalf("failed to decode og image config: %v", err)
		}
		if format != "png" {
			t.Errorf("expected format 'png', got %s", format)
		}
		if cfg.Width > 1200 || cfg.Height > 630 {
			t.Errorf("expected image to fit within 1200x630, got %dx%d", cfg.Width, cfg.Height)
		}
	})
}

