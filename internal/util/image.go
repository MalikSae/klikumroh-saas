package util

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/disintegration/imaging"
	"github.com/skrashevich/go-webp"
	_ "golang.org/x/image/webp"
)

var (
	ErrInvalidImageFormat = errors.New("hanya menerima format JPG, PNG, atau WEBP")
	ErrCorruptImage       = errors.New("format gambar tidak valid atau rusak")
	// ErrImageTooLarge: the image declares more pixels than the server will decode. Handlers answer 400
	// with this message.
	ErrImageTooLarge = errors.New("resolusi gambar terlalu besar (maksimal 12.000 piksel per sisi dan 40 megapiksel), perkecil gambar lalu unggah lagi")
	// ErrImageTooHeavy: a high bit-depth image (16 bits per channel) whose decoded size would pass
	// MaxDecodedImageBytes although its pixel count is within MaxImagePixels. Answered 400.
	ErrImageTooHeavy = errors.New("gambar 16-bit ini terlalu besar untuk diproses, simpan ulang sebagai JPG atau PNG 8-bit lalu unggah lagi")
	// ErrImageBusy: every decode slot stayed taken for imageDecodeWait. Handlers answer 503 with this message.
	ErrImageBusy = errors.New("Server sedang memproses gambar lain, coba lagi sebentar.")
)

// Pixel limits checked from the image header before decoding. A small compressed file (e.g. a ~200 KB
// PNG declaring 40000x40000) would otherwise decode into gigabytes of RAM and take the API down for
// every tenant. 40 MP is far above any phone camera photo (~12-50 MP sensors are downscaled by apps).
// MaxDecodedImageBytes also caps the decoded size: a 16-bit PNG decodes to 8 bytes per pixel, so 40 MP
// of it would be ~320 MB from a file of a few KB.
const (
	MaxImageSide         = 12000
	MaxImagePixels       = 40_000_000
	MaxDecodedImageBytes = 256 << 20
)

// Decode concurrency: at most maxConcurrentImageDecodes conversions hold a decoded image at a time
// (each can use up to MaxDecodedImageBytes plus resize/encode buffers), so parallel uploads cannot push
// the shared API out of memory. A request waits up to imageDecodeWait for a slot, then gets ErrImageBusy.
const maxConcurrentImageDecodes = 2

var (
	imageDecodeSlots = make(chan struct{}, maxConcurrentImageDecodes)
	imageDecodeWait  = 10 * time.Second
)

// acquireImageDecodeSlot takes a decode slot, waiting at most imageDecodeWait.
func acquireImageDecodeSlot() (func(), error) {
	select {
	case imageDecodeSlots <- struct{}{}:
	default:
		timer := time.NewTimer(imageDecodeWait)
		defer timer.Stop()
		select {
		case imageDecodeSlots <- struct{}{}:
		case <-timer.C:
			return nil, ErrImageBusy
		}
	}
	var once sync.Once
	return func() { once.Do(func() { <-imageDecodeSlots }) }, nil
}

// decodedBytesPerPixel is what one pixel costs in RAM once decoded. 16-bit-per-channel models use 8
// bytes; everything else is counted as 4, since the pipeline converts to NRGBA/RGBA (4 bytes) anyway.
func decodedBytesPerPixel(m color.Model) int64 {
	switch m {
	case color.RGBA64Model, color.NRGBA64Model:
		return 8
	}
	return 4
}

// checkImageDimensions reads only the image header (image.DecodeConfig) and refuses images whose
// declared size exceeds MaxImageSide or MaxImagePixels, or whose decoded size exceeds MaxDecodedImageBytes.
func checkImageDimensions(fileBytes []byte) error {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(fileBytes))
	if err != nil {
		return fmt.Errorf("%w: %v", ErrCorruptImage, err)
	}
	if cfg.Width <= 0 || cfg.Height <= 0 {
		return ErrCorruptImage
	}
	pixels := int64(cfg.Width) * int64(cfg.Height)
	if cfg.Width > MaxImageSide || cfg.Height > MaxImageSide || pixels > MaxImagePixels {
		return ErrImageTooLarge
	}
	if pixels*decodedBytesPerPixel(cfg.ColorModel) > MaxDecodedImageBytes {
		return ErrImageTooHeavy
	}
	return nil
}

// decodeUpload validates the format (JPEG/PNG/WebP), checks the declared pixel size before allocating
// anything, takes a decode slot, then decodes with EXIF auto-orientation. The caller must call release
// once it no longer holds the decoded image (after encoding); release is nil when err is not.
func decodeUpload(fileBytes []byte) (image.Image, func(), error) {
	contentType := http.DetectContentType(fileBytes)
	if contentType != "image/jpeg" && contentType != "image/png" && contentType != "image/webp" {
		return nil, nil, ErrInvalidImageFormat
	}
	if err := checkImageDimensions(fileBytes); err != nil {
		return nil, nil, err
	}
	release, err := acquireImageDecodeSlot()
	if err != nil {
		return nil, nil, err
	}
	img, err := imaging.Decode(bytes.NewReader(fileBytes), imaging.AutoOrientation(true))
	if err != nil {
		release()
		return nil, nil, fmt.Errorf("%w: %v", ErrCorruptImage, err)
	}
	return img, release, nil
}

// IsImageClientError reports whether an image conversion error is the uploader's fault (wrong format,
// corrupt file, too many pixels) and should be answered 400 with err.Error().
func IsImageClientError(err error) bool {
	return errors.Is(err, ErrInvalidImageFormat) || errors.Is(err, ErrCorruptImage) || errors.Is(err, ErrImageTooLarge) ||
		errors.Is(err, ErrImageTooHeavy)
}

// IsImageBusyError reports ErrImageBusy: answered 503 with err.Error() (the upload can be retried).
func IsImageBusyError(err error) bool {
	return errors.Is(err, ErrImageBusy)
}

// ConvertAndSaveWebP validates image format (JPEG/PNG/WebP), auto-orients,
// resizes if wider than maxWidth (default 1600), converts to RGBA,
// and encodes to WebP at destinationPath with the specified quality (default 80).
func ConvertAndSaveWebP(fileBytes []byte, destinationPath string, maxWidth int, quality float32) error {
	img, release, err := decodeUpload(fileBytes)
	if err != nil {
		return err
	}
	defer release()

	if maxWidth <= 0 {
		maxWidth = 1600
	}
	if img.Bounds().Dx() > maxWidth {
		img = imaging.Resize(img, maxWidth, 0, imaging.Lanczos)
	}

	b := img.Bounds()
	rgbaImg := image.NewRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	draw.Draw(rgbaImg, rgbaImg.Bounds(), img, b.Min, draw.Src)

	if quality <= 0 {
		quality = 80
	}
	return saveAtomically(destinationPath, func(out io.Writer) error {
		if err := webp.Encode(out, rgbaImg, &webp.Options{Lossy: true, Quality: quality}); err != nil {
			return fmt.Errorf("gagal mengkonversi ke WebP: %w", err)
		}
		return nil
	})
}

// ConvertAndSaveSquareWebP validates image format (JPEG/PNG/WebP), auto-orients,
// crops/resizes into a 1:1 square of size x size (default 1000x1000) using center anchor,
// converts to RGBA, and encodes to WebP at destinationPath.
func ConvertAndSaveSquareWebP(fileBytes []byte, destinationPath string, size int, quality float32) error {
	img, release, err := decodeUpload(fileBytes)
	if err != nil {
		return err
	}
	defer release()

	if size <= 0 {
		size = 1000
	}
	// Center-crop to 1:1 aspect ratio and resize to size x size
	img = imaging.Fill(img, size, size, imaging.Center, imaging.Lanczos)

	b := img.Bounds()
	rgbaImg := image.NewRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	draw.Draw(rgbaImg, rgbaImg.Bounds(), img, b.Min, draw.Src)

	if quality <= 0 {
		quality = 85
	}
	return saveAtomically(destinationPath, func(out io.Writer) error {
		if err := webp.Encode(out, rgbaImg, &webp.Options{Lossy: true, Quality: quality}); err != nil {
			return fmt.Errorf("gagal mengkonversi ke WebP: %w", err)
		}
		return nil
	})
}

// ConvertAndSavePNGIcon validates image format (JPEG/PNG/WebP), auto-orients,
// center-crops to a 1:1 square of size x size (default 256x256),
// and encodes to PNG with BestCompression to serve as a crisp, lightweight favicon/icon.
func ConvertAndSavePNGIcon(fileBytes []byte, destinationPath string, size int) error {
	img, release, err := decodeUpload(fileBytes)
	if err != nil {
		return err
	}
	defer release()

	if size <= 0 {
		size = 256
	}
	// Center-crop to 1:1 aspect ratio and resize to size x size
	img = imaging.Fill(img, size, size, imaging.Center, imaging.Lanczos)

	b := img.Bounds()
	rgbaImg := image.NewNRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	draw.Draw(rgbaImg, rgbaImg.Bounds(), img, b.Min, draw.Src)

	encoder := &png.Encoder{CompressionLevel: png.BestCompression}
	return saveAtomically(destinationPath, func(out io.Writer) error {
		if err := encoder.Encode(out, rgbaImg); err != nil {
			return fmt.Errorf("gagal mengkonversi ke PNG: %w", err)
		}
		return nil
	})
}

// ConvertAndSavePNGLogo validates image format (JPEG/PNG/WebP), auto-orients,
// resizes proportionally if wider than maxWidth (default 600px),
// and encodes to PNG with BestCompression to preserve crisp alpha transparency for headers.
func ConvertAndSavePNGLogo(fileBytes []byte, destinationPath string, maxWidth int) error {
	img, release, err := decodeUpload(fileBytes)
	if err != nil {
		return err
	}
	defer release()

	if maxWidth <= 0 {
		maxWidth = 600
	}
	if img.Bounds().Dx() > maxWidth {
		img = imaging.Resize(img, maxWidth, 0, imaging.Lanczos)
	}

	b := img.Bounds()
	rgbaImg := image.NewNRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	draw.Draw(rgbaImg, rgbaImg.Bounds(), img, b.Min, draw.Src)

	encoder := &png.Encoder{CompressionLevel: png.BestCompression}
	return saveAtomically(destinationPath, func(out io.Writer) error {
		if err := encoder.Encode(out, rgbaImg); err != nil {
			return fmt.Errorf("gagal mengkonversi ke PNG: %w", err)
		}
		return nil
	})
}

// OGImageJPEGQuality is the JPEG quality of the share image. A share image is usually a photo: as JPEG it
// is a fraction of the PNG size, and every link preview (WhatsApp, Facebook, X) supports JPEG.
const OGImageJPEGQuality = 85

// ConvertAndSaveJPEGOGImage validates image format (JPEG/PNG/WebP), auto-orients,
// resizes proportionally to fit within maxWidth x maxHeight (default 1200x630, standard 1.91:1 OG image),
// flattens any transparency onto white, and encodes to JPEG for the WhatsApp & social share preview card.
func ConvertAndSaveJPEGOGImage(fileBytes []byte, destinationPath string, maxWidth, maxHeight int) error {
	img, release, err := decodeUpload(fileBytes)
	if err != nil {
		return err
	}
	defer release()

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

	// JPEG has no alpha channel: paint the image over white so transparent areas do not turn black.
	b := img.Bounds()
	rgbaImg := image.NewRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	draw.Draw(rgbaImg, rgbaImg.Bounds(), image.White, image.Point{}, draw.Src)
	draw.Draw(rgbaImg, rgbaImg.Bounds(), img, b.Min, draw.Over)

	return saveAtomically(destinationPath, func(out io.Writer) error {
		if err := jpeg.Encode(out, rgbaImg, &jpeg.Options{Quality: OGImageJPEGQuality}); err != nil {
			return fmt.Errorf("gagal mengkonversi ke JPEG: %w", err)
		}
		return nil
	})
}

// saveAtomically writes an encoded image next to destinationPath under a temporary name and only
// renames it over destinationPath once encoding fully succeeded. A failed upload (bad image, encoder
// error, full disk) therefore never truncates or half-overwrites the file already stored there,
// which matters for fixed-path files such as an agent's transfer proof or a travel's logo.
func saveAtomically(destinationPath string, encode func(io.Writer) error) error {
	dir := filepath.Dir(destinationPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("gagal membuat direktori: %w", err)
	}
	tmp, err := os.CreateTemp(dir, ".upload-*.tmp")
	if err != nil {
		return fmt.Errorf("gagal menyimpan file: %w", err)
	}
	tmpPath := tmp.Name()
	if err := encode(tmp); err != nil {
		_ = tmp.Close()
		_ = os.Remove(tmpPath)
		return err
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("gagal menyimpan file: %w", err)
	}
	// os.CreateTemp creates the file 0600; uploads are served by the web server, so use the
	// permissions os.Create would have given.
	_ = os.Chmod(tmpPath, 0644)
	if err := os.Rename(tmpPath, destinationPath); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("gagal menyimpan file: %w", err)
	}
	return nil
}
