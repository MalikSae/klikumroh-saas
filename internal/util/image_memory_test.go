package util

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"sync"
	"testing"
	"time"
)

// Memory measurement of the upload conversion pipeline (6 Oct 2026). A conversion holds a decode slot
// for its whole run, so its peak heap times maxConcurrentImageDecodes is what parallel uploads can cost
// the shared API process on a small VPS.

const mib = 1 << 20

// memPeak runs f and reports the highest HeapInuse seen while it ran (above the level before it started)
// and the bytes it allocated. The heap is sampled every millisecond; big pixel buffers stay in use far
// longer than that, so the peak is not missed.
func memPeak(f func()) (peak, alloc uint64) {
	runtime.GC()
	runtime.GC()
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)
	base, baseAlloc := ms.HeapInuse, ms.TotalAlloc

	stop := make(chan struct{})
	result := make(chan uint64)
	go func() {
		var m runtime.MemStats
		var max uint64
		tick := time.NewTicker(time.Millisecond)
		defer tick.Stop()
		for {
			runtime.ReadMemStats(&m)
			if m.HeapInuse > max {
				max = m.HeapInuse
			}
			select {
			case <-stop:
				result <- max
				return
			case <-tick.C:
			}
		}
	}()
	f()
	close(stop)
	max := <-result
	runtime.ReadMemStats(&ms)
	if ms.HeapInuse > max {
		max = ms.HeapInuse
	}
	if max > base {
		peak = max - base
	}
	return peak, ms.TotalAlloc - baseAlloc
}

// withExifOrientation inserts an EXIF APP1 segment carrying the given orientation tag right after the
// JPEG SOI marker.
func withExifOrientation(jpg []byte, orient uint16) []byte {
	var tiff bytes.Buffer
	tiff.WriteString("MM")
	_ = binary.Write(&tiff, binary.BigEndian, uint16(42))
	_ = binary.Write(&tiff, binary.BigEndian, uint32(8)) // IFD0 offset
	_ = binary.Write(&tiff, binary.BigEndian, uint16(1)) // one tag
	_ = binary.Write(&tiff, binary.BigEndian, uint16(0x0112))
	_ = binary.Write(&tiff, binary.BigEndian, uint16(3)) // SHORT
	_ = binary.Write(&tiff, binary.BigEndian, uint32(1))
	_ = binary.Write(&tiff, binary.BigEndian, orient)
	_ = binary.Write(&tiff, binary.BigEndian, uint16(0))
	_ = binary.Write(&tiff, binary.BigEndian, uint32(0)) // no next IFD
	payload := append([]byte("Exif\x00\x00"), tiff.Bytes()...)

	var out bytes.Buffer
	out.Write(jpg[:2])
	out.Write([]byte{0xff, 0xe1})
	_ = binary.Write(&out, binary.BigEndian, uint16(len(payload)+2))
	out.Write(payload)
	out.Write(jpg[2:])
	return out.Bytes()
}

// photoLike fills an w x h opaque image with smooth gradients plus a fine texture, so encoders and
// resamplers do realistic work.
func photoLike(w, h int) *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		row := img.Pix[y*img.Stride:]
		for x := 0; x < w; x++ {
			i := x * 4
			row[i] = uint8(x * 255 / w)
			row[i+1] = uint8(y * 255 / h)
			row[i+2] = uint8((x*7 + y*13) & 0xff)
			row[i+3] = 0xff
		}
	}
	return img
}

func encodeJPEG(t testing.TB, img image.Image) []byte {
	t.Helper()
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func encodePNGFast(t testing.TB, img image.Image) []byte {
	t.Helper()
	var buf bytes.Buffer
	enc := png.Encoder{CompressionLevel: png.BestSpeed}
	if err := enc.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// png16 builds an opaque 16-bit-per-channel RGB PNG of w x h (decodes to *image.RGBA64, 8 bytes/pixel).
func png16(t testing.TB, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA64(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.SetRGBA64(x, y, color.RGBA64{R: uint16(x * 65535 / w), G: uint16(y * 65535 / h), B: uint16(x ^ y), A: 0xffff})
		}
	}
	return encodePNGFast(t, img)
}

type memInput struct {
	name string
	data []byte
}

var (
	memInputsOnce sync.Once
	memInputs     []memInput
)

// worstCaseInputs are the heaviest uploads the current limits accept: the largest 8-bit JPEG and PNG
// (MaxImagePixels), the same JPEG rotated by EXIF, a 16-bit PNG at the decoded-bytes budget and a tall
// image that is not resized by the width-capped helpers.
func worstCaseInputs(t testing.TB) []memInput {
	memInputsOnce.Do(func() {
		w, h := sidesFor(MaxImagePixels, 4, 3)
		photo := photoLike(w, h)
		jpg := encodeJPEG(t, photo)
		memInputs = append(memInputs,
			memInput{name: "JPEG 8-bit " + dims(w, h), data: jpg},
			memInput{name: "JPEG 8-bit " + dims(w, h) + " EXIF 6", data: withExifOrientation(jpg, 6)},
			memInput{name: "PNG 8-bit " + dims(w, h), data: encodePNGFast(t, photo)},
		)
		photo = nil
		runtime.GC()

		w16, h16 := sidesFor(int(MaxDecodedImageBytes/8), 1, 1)
		memInputs = append(memInputs, memInput{name: "PNG 16-bit " + dims(w16, h16), data: png16(t, w16, h16)})
		runtime.GC()

		tw := 1600
		th := MaxImageSide
		if tw*th > MaxImagePixels {
			th = MaxImagePixels / tw
		}
		memInputs = append(memInputs, memInput{name: "PNG 8-bit tall " + dims(tw, th), data: encodePNGFast(t, photoLike(tw, th))})
		runtime.GC()

		// Tallest image at the pixel limit: the width-capped helpers' first resize pass is
		// maxWidth x full height, and their output is the tallest.
		th = MaxImageSide
		tw = MaxImagePixels / th
		memInputs = append(memInputs, memInput{name: "PNG 8-bit tall " + dims(tw, th), data: encodePNGFast(t, photoLike(tw, th))})
		runtime.GC()
	})
	return memInputs
}

// sidesFor returns the largest w x h with aspect ratio aw:ah and w*h <= pixels.
func sidesFor(pixels, aw, ah int) (int, int) {
	unit := 1
	for (unit+1)*(unit+1)*aw*ah <= pixels {
		unit++
	}
	w, h := unit*aw, unit*ah
	for w > MaxImageSide || h > MaxImageSide {
		unit--
		w, h = unit*aw, unit*ah
	}
	return w, h
}

func dims(w, h int) string {
	return itoa(w) + "x" + itoa(h)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}

type memConv struct {
	name string
	run  func(data []byte, dir string) error
}

var memConvs = []memConv{
	{"WebP 1600", func(b []byte, d string) error { return ConvertAndSaveWebP(b, filepath.Join(d, "a.webp"), 1600, 80) }},
	{"SquareWebP 1000", func(b []byte, d string) error {
		return ConvertAndSaveSquareWebP(b, filepath.Join(d, "b.webp"), 1000, 85)
	}},
	{"PNGIcon 256", func(b []byte, d string) error { return ConvertAndSavePNGIcon(b, filepath.Join(d, "c.png"), 256) }},
	{"PNGLogo 600", func(b []byte, d string) error { return ConvertAndSavePNGLogo(b, filepath.Join(d, "d.png"), 600) }},
	{"JPEGOG 1200x630", func(b []byte, d string) error {
		return ConvertAndSaveJPEGOGImage(b, filepath.Join(d, "e.jpg"), 1200, 630)
	}},
}

// TestImageMemoryReport prints the peak heap of every conversion helper on every worst-case input.
// It is slow (tens of seconds), so it only runs with IMAGE_MEMREPORT=1.
func TestImageMemoryReport(t *testing.T) {
	if os.Getenv("IMAGE_MEMREPORT") == "" {
		t.Skip("set IMAGE_MEMREPORT=1 to print the conversion memory report")
	}
	inputs := worstCaseInputs(t)
	dir := t.TempDir()
	for _, gc := range []int{100, 10} {
		old := debug.SetGCPercent(gc)
		for _, in := range inputs {
			for _, c := range memConvs {
				var err error
				start := time.Now()
				peak, alloc := memPeak(func() { err = c.run(in.data, dir) })
				t.Logf("GOGC=%-3d %-34s %-16s peak %4d MiB  alloc %5d MiB  %5s  err=%v",
					gc, in.name, c.name, peak/mib, alloc/mib, time.Since(start).Round(10*time.Millisecond), err)
			}
		}
		debug.SetGCPercent(old)
	}
}

// Per-conversion heap ceiling at the current limits. Two decode slots at this ceiling stay under
// ~400 MB, which a 2 GB VPS running the API, MySQL and Next.js can afford. Measured worst case on
// 6 Oct 2026: ~170 MiB (3000x8000 PNG to 1600px WebP). Slow (~1 minute): skipped with -short.
const imageConversionHeapCeiling = 190 * mib

func TestImageConversionPeakHeapCeiling(t *testing.T) {
	if testing.Short() {
		t.Skip("slow memory test")
	}
	dir := t.TempDir()
	var worst uint64
	for _, in := range worstCaseInputs(t) {
		for _, c := range memConvs {
			var err error
			peak, _ := memPeak(func() { err = c.run(in.data, dir) })
			if err != nil {
				t.Fatalf("%s %s: %v", in.name, c.name, err)
			}
			if peak > worst {
				worst = peak
			}
			if peak > imageConversionHeapCeiling {
				t.Errorf("%s %s: peak heap %d MiB over the %d MiB ceiling", in.name, c.name, peak/mib, imageConversionHeapCeiling/mib)
			}
		}
	}
	t.Logf("worst peak heap per conversion: %d MiB (ceiling %d MiB, %d slots)", worst/mib, imageConversionHeapCeiling/mib, maxConcurrentImageDecodes)
}
