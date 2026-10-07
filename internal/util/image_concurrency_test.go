package util

import (
	"bytes"
	"encoding/binary"
	"errors"
	"hash/crc32"
	"image"
	"image/color"
	"image/png"
	"path/filepath"
	"testing"
	"time"
)

// pngHeader builds a PNG whose IHDR declares width x height at the given bit depth and color type, with
// a dummy IDAT: enough for image.DecodeConfig.
func pngHeader(width, height uint32, bitDepth, colorType byte) []byte {
	var buf bytes.Buffer
	buf.Write([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'})
	ihdr := make([]byte, 13)
	binary.BigEndian.PutUint32(ihdr[0:4], width)
	binary.BigEndian.PutUint32(ihdr[4:8], height)
	ihdr[8] = bitDepth
	ihdr[9] = colorType
	chunk := func(typ string, data []byte) {
		_ = binary.Write(&buf, binary.BigEndian, uint32(len(data)))
		buf.WriteString(typ)
		buf.Write(data)
		c := crc32.NewIEEE()
		c.Write([]byte(typ))
		c.Write(data)
		_ = binary.Write(&buf, binary.BigEndian, c.Sum32())
	}
	chunk("IHDR", ihdr)
	chunk("IDAT", []byte{0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01})
	chunk("IEND", nil)
	return buf.Bytes()
}

// M3: a 16-bit image counts 8 bytes per pixel against MaxDecodedImageBytes (96 MiB), so a 16 MP 16-bit PNG
// (128 MB decoded) is refused although it is under 24 MP; the same size at 8 bits, and a 12 MP 16-bit one,
// pass. 24 MP at 8 bits (the pixel limit) fits the budget.
func TestImageDecodedSizeBudget(t *testing.T) {
	cases := []struct {
		name      string
		data      []byte
		wantHeavy bool
	}{
		{"16-bit RGBA 4000x4000 (128 MB)", pngHeader(4000, 4000, 16, 6), true},
		{"16-bit RGB 4000x4000 (128 MB)", pngHeader(4000, 4000, 16, 2), true},
		{"8-bit RGBA 4000x4000 (64 MB)", pngHeader(4000, 4000, 8, 6), false},
		{"16-bit RGBA 3500x3500 (98 MB)", pngHeader(3500, 3500, 16, 6), false},
		{"8-bit RGBA 6000x4000 (96 MB, 24 MP)", pngHeader(6000, 4000, 8, 6), false},
	}
	for _, c := range cases {
		err := checkImageDimensions(c.data)
		t.Logf("%s: %v", c.name, err)
		if c.wantHeavy != errors.Is(err, ErrImageTooHeavy) || (!c.wantHeavy && err != nil) {
			t.Fatalf("%s: got %v", c.name, err)
		}
		if err != nil && !IsImageClientError(err) {
			t.Fatalf("%s: a too-heavy image must be a 400 client error", c.name)
		}
	}
	// The conversion helpers refuse it from the header, before decoding.
	err := ConvertAndSaveWebP(pngHeader(4000, 4000, 16, 6), filepath.Join(t.TempDir(), "x.webp"), 1600, 80)
	if !errors.Is(err, ErrImageTooHeavy) {
		t.Fatalf("ConvertAndSaveWebP: expected ErrImageTooHeavy, got %v", err)
	}
}

func smallPNG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 8, 8))
	for i := range img.Pix {
		img.Pix[i] = 200
	}
	img.Set(1, 1, color.RGBA{R: 10, A: 255})
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// M3: at most maxConcurrentImageDecodes conversions decode at once; a request that cannot get a slot within
// imageDecodeWait gets ErrImageBusy (503), and slots are given back after success and after failure.
func TestImageDecodeConcurrencyLimit(t *testing.T) {
	oldWait := imageDecodeWait
	imageDecodeWait = 50 * time.Millisecond
	t.Cleanup(func() { imageDecodeWait = oldWait })
	dir := t.TempDir()
	data := smallPNG(t)

	if cap(imageDecodeSlots) != 2 {
		t.Fatalf("expected 2 decode slots, got %d", cap(imageDecodeSlots))
	}
	// Two conversions in progress hold both slots.
	imageDecodeSlots <- struct{}{}
	imageDecodeSlots <- struct{}{}
	start := time.Now()
	err := ConvertAndSaveWebP(data, filepath.Join(dir, "busy.webp"), 1600, 80)
	t.Logf("third conversion while 2 are running: %v (waited %s)", err, time.Since(start).Round(time.Millisecond))
	if !errors.Is(err, ErrImageBusy) || !IsImageBusyError(err) || IsImageClientError(err) {
		t.Fatalf("expected ErrImageBusy (not a 400 client error), got %v", err)
	}
	if err.Error() != "Server sedang memproses gambar lain, coba lagi sebentar." {
		t.Fatalf("unexpected message %q", err.Error())
	}

	// One finishes: the waiting conversion gets the slot and succeeds.
	done := make(chan error, 1)
	imageDecodeWait = 2 * time.Second
	go func() { done <- ConvertAndSaveWebP(data, filepath.Join(dir, "after.webp"), 1600, 80) }()
	time.Sleep(20 * time.Millisecond)
	<-imageDecodeSlots
	if err := <-done; err != nil {
		t.Fatalf("conversion after a slot freed: %v", err)
	}
	<-imageDecodeSlots
	if n := len(imageDecodeSlots); n != 0 {
		t.Fatalf("a finished conversion must give its slot back, %d still taken", n)
	}

	// A corrupt image (header fine, data broken) also gives its slot back.
	broken := pngHeader(10, 10, 8, 6)
	if err := ConvertAndSaveWebP(broken, filepath.Join(dir, "broken.webp"), 1600, 80); !errors.Is(err, ErrCorruptImage) {
		t.Fatalf("expected ErrCorruptImage, got %v", err)
	}
	if n := len(imageDecodeSlots); n != 0 {
		t.Fatalf("a failed decode must give its slot back, %d still taken", n)
	}
}
