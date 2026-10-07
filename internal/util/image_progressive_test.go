package util

import (
	"bytes"
	"errors"
	"image"
	"image/jpeg"
	"testing"
)

// jpegHeader builds a JPEG start: SOI and one frame header (sof marker) declaring w x h with the given
// per-component sampling factors (H<<4 | V). Enough for image.DecodeConfig and the size checks.
func jpegHeader(sof byte, w, h int, sampling ...byte) []byte {
	seg := []byte{8, byte(h >> 8), byte(h), byte(w >> 8), byte(w), byte(len(sampling))}
	for i, s := range sampling {
		seg = append(seg, byte(i+1), s, 0)
	}
	n := len(seg) + 2
	out := []byte{0xFF, 0xD8, 0xFF, sof, byte(n >> 8), byte(n)}
	// DecodeConfig stops at the start of scan (SOS), so an empty one ends the header.
	return append(append(out, seg...), 0xFF, 0xDA, 0x00, 0x02, 0xFF, 0xD9)
}

// A progressive JPEG costs its coefficient buffer on top of the image: a few-byte file declaring a large
// 4:4:4 or CMYK frame is refused before decoding (security audit 7 Oct 2026); baseline frames of the same
// size, and a usual 4:2:0 progressive photo, still pass.
func TestCheckImageDimensions_ProgressiveJPEG(t *testing.T) {
	cases := []struct {
		name string
		file []byte
		want error
	}{
		{"progressive 4:4:4 24 MP", jpegHeader(0xC2, 6000, 4000, 0x11, 0x11, 0x11), ErrJPEGTooHeavy},
		{"progressive CMYK 12 MP", jpegHeader(0xC2, 4000, 3000, 0x11, 0x11, 0x11, 0x11), ErrJPEGTooHeavy},
		{"progressive 4:4:4 8 MP", jpegHeader(0xC2, 3264, 2448, 0x11, 0x11, 0x11), nil},
		{"progressive 4:2:0 12 MP", jpegHeader(0xC2, 4000, 3000, 0x22, 0x11, 0x11), nil},
		{"progressive 4:2:0 24 MP", jpegHeader(0xC2, 6000, 4000, 0x22, 0x11, 0x11), ErrJPEGTooHeavy},
		{"baseline 4:4:4 24 MP", jpegHeader(0xC0, 6000, 4000, 0x11, 0x11, 0x11), nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := checkImageDimensions(c.file)
			if (c.want == nil && err != nil) || (c.want != nil && !errors.Is(err, c.want)) {
				t.Fatalf("got %v, want %v", err, c.want)
			}
		})
	}
	if !IsImageClientError(ErrJPEGTooHeavy) {
		t.Fatal("ErrJPEGTooHeavy must be answered 400")
	}
}

// A real (baseline) JPEG from the encoder has no coefficient buffer.
func TestJPEGCoefficientBytes_Baseline(t *testing.T) {
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, image.NewRGBA(image.Rect(0, 0, 64, 64)), nil); err != nil {
		t.Fatal(err)
	}
	if got := jpegCoefficientBytes(buf.Bytes(), 64*64); got != 0 {
		t.Fatalf("baseline JPEG: got %d extra bytes, want 0", got)
	}
}
