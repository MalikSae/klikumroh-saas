package handler

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"os"
	"testing"

	"github.com/disintegration/imaging"
	"github.com/skrashevich/go-webp"
	_ "golang.org/x/image/webp"
)

func TestWebPDecoding(t *testing.T) {
	// 1. Create a dummy PNG image
	img := image.NewRGBA(image.Rect(0, 0, 100, 100))
	for y := 0; y < 100; y++ {
		for x := 0; x < 100; x++ {
			img.Set(x, y, color.RGBA{R: 255, G: 0, B: 0, A: 255})
		}
	}
	var pngBuf bytes.Buffer
	if err := png.Encode(&pngBuf, img); err != nil {
		t.Fatalf("failed to encode png: %v", err)
	}

	// 2. Encode to WebP using skrashevich/go-webp
	var webpBuf bytes.Buffer
	if err := webp.Encode(&webpBuf, img, &webp.Options{Lossy: true, Quality: 80}); err != nil {
		t.Fatalf("failed to encode webp: %v", err)
	}

	// 3. Test decoding with golang.org/x/image/webp registered
	t.Run("image.Decode on WebP", func(t *testing.T) {
		decoded, format, err := image.Decode(bytes.NewReader(webpBuf.Bytes()))
		if err != nil {
			t.Fatalf("image.Decode failed: %v", err)
		}
		if format != "webp" {
			t.Errorf("expected format webp, got %s", format)
		}
		if decoded.Bounds().Dx() != 100 {
			t.Errorf("expected width 100, got %d", decoded.Bounds().Dx())
		}
	})

	t.Run("existing uploaded webp file", func(t *testing.T) {
		filePath := "../../uploads/53/packages/38/c934f3d0-442b-46c0-8651-3096f70bdafe.webp"
		data, err := os.ReadFile(filePath)
		if err != nil {
			t.Skipf("uploaded file not found: %v", err)
			return
		}

		// Try imaging.Decode
		decoded, err := imaging.Decode(bytes.NewReader(data))
		if err != nil {
			t.Fatalf("imaging.Decode failed on actual upload: %v", err)
		}
		if decoded.Bounds().Dx() <= 0 {
			t.Errorf("invalid width: %d", decoded.Bounds().Dx())
		}
	})
}
