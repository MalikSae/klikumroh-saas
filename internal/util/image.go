package util

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	"image/draw"
	"image/png"
	"net/http"
	"os"
	"path/filepath"

	"github.com/disintegration/imaging"
	"github.com/skrashevich/go-webp"
	_ "golang.org/x/image/webp"
)

var (
	ErrInvalidImageFormat = errors.New("hanya menerima format JPG, PNG, atau WEBP")
	ErrCorruptImage       = errors.New("format gambar tidak valid atau rusak")
)

// ConvertAndSaveWebP validates image format (JPEG/PNG/WebP), auto-orients,
// resizes if wider than maxWidth (default 1600), converts to RGBA,
// and encodes to WebP at destinationPath with the specified quality (default 80).
func ConvertAndSaveWebP(fileBytes []byte, destinationPath string, maxWidth int, quality float32) error {
	contentType := http.DetectContentType(fileBytes)
	if contentType != "image/jpeg" && contentType != "image/png" && contentType != "image/webp" {
		return ErrInvalidImageFormat
	}

	img, err := imaging.Decode(bytes.NewReader(fileBytes), imaging.AutoOrientation(true))
	if err != nil {
		return fmt.Errorf("%w: %v", ErrCorruptImage, err)
	}

	if maxWidth <= 0 {
		maxWidth = 1600
	}
	if img.Bounds().Dx() > maxWidth {
		img = imaging.Resize(img, maxWidth, 0, imaging.Lanczos)
	}

	b := img.Bounds()
	rgbaImg := image.NewRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	draw.Draw(rgbaImg, rgbaImg.Bounds(), img, b.Min, draw.Src)

	if err := os.MkdirAll(filepath.Dir(destinationPath), 0755); err != nil {
		return fmt.Errorf("gagal membuat direktori: %w", err)
	}

	out, err := os.Create(destinationPath)
	if err != nil {
		return fmt.Errorf("gagal menyimpan file: %w", err)
	}
	defer out.Close()

	if quality <= 0 {
		quality = 80
	}
	if err := webp.Encode(out, rgbaImg, &webp.Options{Lossy: true, Quality: quality}); err != nil {
		return fmt.Errorf("gagal mengkonversi ke WebP: %w", err)
	}

	return nil
}

// ConvertAndSaveSquareWebP validates image format (JPEG/PNG/WebP), auto-orients,
// crops/resizes into a 1:1 square of size x size (default 1000x1000) using center anchor,
// converts to RGBA, and encodes to WebP at destinationPath.
func ConvertAndSaveSquareWebP(fileBytes []byte, destinationPath string, size int, quality float32) error {
	contentType := http.DetectContentType(fileBytes)
	if contentType != "image/jpeg" && contentType != "image/png" && contentType != "image/webp" {
		return ErrInvalidImageFormat
	}

	img, err := imaging.Decode(bytes.NewReader(fileBytes), imaging.AutoOrientation(true))
	if err != nil {
		return fmt.Errorf("%w: %v", ErrCorruptImage, err)
	}

	if size <= 0 {
		size = 1000
	}
	// Center-crop to 1:1 aspect ratio and resize to size x size
	img = imaging.Fill(img, size, size, imaging.Center, imaging.Lanczos)

	b := img.Bounds()
	rgbaImg := image.NewRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	draw.Draw(rgbaImg, rgbaImg.Bounds(), img, b.Min, draw.Src)

	if err := os.MkdirAll(filepath.Dir(destinationPath), 0755); err != nil {
		return fmt.Errorf("gagal membuat direktori: %w", err)
	}

	out, err := os.Create(destinationPath)
	if err != nil {
		return fmt.Errorf("gagal menyimpan file: %w", err)
	}
	defer out.Close()

	if quality <= 0 {
		quality = 85
	}
	if err := webp.Encode(out, rgbaImg, &webp.Options{Lossy: true, Quality: quality}); err != nil {
		return fmt.Errorf("gagal mengkonversi ke WebP: %w", err)
	}

	return nil
}

// ConvertAndSavePNGIcon validates image format (JPEG/PNG/WebP), auto-orients,
// center-crops to a 1:1 square of size x size (default 256x256),
// and encodes to PNG with BestCompression to serve as a crisp, lightweight favicon/icon.
func ConvertAndSavePNGIcon(fileBytes []byte, destinationPath string, size int) error {
	contentType := http.DetectContentType(fileBytes)
	if contentType != "image/jpeg" && contentType != "image/png" && contentType != "image/webp" {
		return ErrInvalidImageFormat
	}

	img, err := imaging.Decode(bytes.NewReader(fileBytes), imaging.AutoOrientation(true))
	if err != nil {
		return fmt.Errorf("%w: %v", ErrCorruptImage, err)
	}

	if size <= 0 {
		size = 256
	}
	// Center-crop to 1:1 aspect ratio and resize to size x size
	img = imaging.Fill(img, size, size, imaging.Center, imaging.Lanczos)

	b := img.Bounds()
	rgbaImg := image.NewNRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	draw.Draw(rgbaImg, rgbaImg.Bounds(), img, b.Min, draw.Src)

	if err := os.MkdirAll(filepath.Dir(destinationPath), 0755); err != nil {
		return fmt.Errorf("gagal membuat direktori: %w", err)
	}

	out, err := os.Create(destinationPath)
	if err != nil {
		return fmt.Errorf("gagal menyimpan file: %w", err)
	}
	defer out.Close()

	encoder := &png.Encoder{CompressionLevel: png.BestCompression}
	if err := encoder.Encode(out, rgbaImg); err != nil {
		return fmt.Errorf("gagal mengkonversi ke PNG: %w", err)
	}

	return nil
}

// ConvertAndSavePNGLogo validates image format (JPEG/PNG/WebP), auto-orients,
// resizes proportionally if wider than maxWidth (default 600px),
// and encodes to PNG with BestCompression to preserve crisp alpha transparency for headers.
func ConvertAndSavePNGLogo(fileBytes []byte, destinationPath string, maxWidth int) error {
	contentType := http.DetectContentType(fileBytes)
	if contentType != "image/jpeg" && contentType != "image/png" && contentType != "image/webp" {
		return ErrInvalidImageFormat
	}

	img, err := imaging.Decode(bytes.NewReader(fileBytes), imaging.AutoOrientation(true))
	if err != nil {
		return fmt.Errorf("%w: %v", ErrCorruptImage, err)
	}

	if maxWidth <= 0 {
		maxWidth = 600
	}
	if img.Bounds().Dx() > maxWidth {
		img = imaging.Resize(img, maxWidth, 0, imaging.Lanczos)
	}

	b := img.Bounds()
	rgbaImg := image.NewNRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	draw.Draw(rgbaImg, rgbaImg.Bounds(), img, b.Min, draw.Src)

	if err := os.MkdirAll(filepath.Dir(destinationPath), 0755); err != nil {
		return fmt.Errorf("gagal membuat direktori: %w", err)
	}

	out, err := os.Create(destinationPath)
	if err != nil {
		return fmt.Errorf("gagal menyimpan file: %w", err)
	}
	defer out.Close()

	encoder := &png.Encoder{CompressionLevel: png.BestCompression}
	if err := encoder.Encode(out, rgbaImg); err != nil {
		return fmt.Errorf("gagal mengkonversi ke PNG: %w", err)
	}

	return nil
}

// ConvertAndSavePNGOGImage validates image format (JPEG/PNG/WebP), auto-orients,
// resizes proportionally to fit within maxWidth x maxHeight (default 1200x630, standard 1.91:1 OG image),
// and encodes to PNG with BestCompression to serve as a high-quality WhatsApp & social share preview card.
func ConvertAndSavePNGOGImage(fileBytes []byte, destinationPath string, maxWidth, maxHeight int) error {
	contentType := http.DetectContentType(fileBytes)
	if contentType != "image/jpeg" && contentType != "image/png" && contentType != "image/webp" {
		return ErrInvalidImageFormat
	}

	img, err := imaging.Decode(bytes.NewReader(fileBytes), imaging.AutoOrientation(true))
	if err != nil {
		return fmt.Errorf("%w: %v", ErrCorruptImage, err)
	}

	if maxWidth <= 0 {
		maxWidth = 1200
	}
	if maxHeight <= 0 {
		maxHeight = 630
	}

	// Fit proportionally within maxWidth x maxHeight if larger
	if img.Bounds().Dx() > maxWidth || img.Bounds().Dy() > maxHeight {
		img = imaging.Fit(img, maxWidth, maxHeight, imaging.Lanczos)
	}

	b := img.Bounds()
	rgbaImg := image.NewNRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	draw.Draw(rgbaImg, rgbaImg.Bounds(), img, b.Min, draw.Src)

	if err := os.MkdirAll(filepath.Dir(destinationPath), 0755); err != nil {
		return fmt.Errorf("gagal membuat direktori: %w", err)
	}

	out, err := os.Create(destinationPath)
	if err != nil {
		return fmt.Errorf("gagal menyimpan file: %w", err)
	}
	defer out.Close()

	encoder := &png.Encoder{CompressionLevel: png.BestCompression}
	if err := encoder.Encode(out, rgbaImg); err != nil {
		return fmt.Errorf("gagal mengkonversi ke PNG: %w", err)
	}

	return nil
}
