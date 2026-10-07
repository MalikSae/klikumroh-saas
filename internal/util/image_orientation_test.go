package util

import (
	"bytes"
	"image"
	"image/color"
	"image/draw"
	"os"
	"path/filepath"
	"testing"

	"github.com/disintegration/imaging"
)

// The pipeline scales the stored image first and applies the EXIF orientation to the small result
// (6 Oct 2026, memory). These tests pin that the orientation, crop and output sizes are what the old
// order (imaging.AutoOrientation at decode, then scale) produced.

func TestReadJPEGOrientation(t *testing.T) {
	jpg := encodeJPEG(t, photoLike(40, 30))
	for o := uint16(1); o <= 8; o++ {
		if got := readJPEGOrientation(withExifOrientation(jpg, o)); got != int(o) {
			t.Fatalf("orientation %d: got %d", o, got)
		}
	}
	if got := readJPEGOrientation(jpg); got != 0 {
		t.Fatalf("JPEG without EXIF: got %d", got)
	}
	if got := readJPEGOrientation(withExifOrientation(jpg, 9)); got != 0 {
		t.Fatalf("invalid tag value: got %d", got)
	}
	if got := readJPEGOrientation(encodePNGFast(t, photoLike(40, 30))); got != 0 {
		t.Fatalf("PNG: got %d", got)
	}
	if got := readJPEGOrientation(withExifOrientation(jpg, 6)[:30]); got != 0 {
		t.Fatalf("truncated EXIF: got %d", got)
	}
}

// storedRect must pick exactly the stored pixels that end up in the oriented rectangle.
func TestStoredRectMatchesOrientation(t *testing.T) {
	const w, h = 7, 5
	stored := image.NewNRGBA(image.Rect(0, 0, w, h))
	for i := 0; i < w*h; i++ {
		stored.Pix[i*4], stored.Pix[i*4+3] = uint8(i), 0xff
	}
	for o := 1; o <= 8; o++ {
		oriented := toNRGBA(orientImage(stored, o))
		ob := oriented.Bounds()
		for _, r := range []image.Rectangle{image.Rect(0, 0, 2, 3), image.Rect(1, 1, 4, 3), image.Rect(2, 0, ob.Dx(), ob.Dy())} {
			want := oriented.SubImage(r)
			got := orientImage(stored.SubImage(storedRect(r, w, h, o)), o)
			if got.Bounds().Size() != r.Size() {
				t.Fatalf("orientation %d rect %v: size %v", o, r, got.Bounds().Size())
			}
			gb := got.Bounds()
			for y := 0; y < r.Dy(); y++ {
				for x := 0; x < r.Dx(); x++ {
					if want.At(r.Min.X+x, r.Min.Y+y) != got.At(gb.Min.X+x, gb.Min.Y+y) {
						t.Fatalf("orientation %d rect %v: pixel (%d,%d) differs", o, r, x, y)
					}
				}
			}
		}
	}
}

// quadrantPhoto is a stored (sensor-orientation) image whose top-left quadrant is red, top-right green,
// bottom-left blue and bottom-right white, so any wrong rotation or flip shows in the output.
func quadrantPhoto(w, h int) *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	fill := func(r image.Rectangle, c color.RGBA) {
		draw.Draw(img, r, &image.Uniform{C: c}, image.Point{}, draw.Src)
	}
	fill(image.Rect(0, 0, w/2, h/2), color.RGBA{R: 220, G: 30, B: 30, A: 255})
	fill(image.Rect(w/2, 0, w, h/2), color.RGBA{R: 30, G: 200, B: 30, A: 255})
	fill(image.Rect(0, h/2, w/2, h), color.RGBA{R: 30, G: 30, B: 220, A: 255})
	fill(image.Rect(w/2, h/2, w, h), color.RGBA{R: 240, G: 240, B: 240, A: 255})
	return img
}

// An EXIF-rotated phone JPEG comes out of every helper upright, at the same size as before, with each
// quadrant where the old orient-then-scale pipeline put it.
func TestConvert_EXIFRotatedJPEG(t *testing.T) {
	jpg := encodeJPEG(t, quadrantPhoto(2400, 1800))
	dir := t.TempDir()
	type conv struct {
		name string
		run  func([]byte, string) error
		ref  func(image.Image) image.Image // the old pipeline on the auto-oriented image
	}
	convs := []conv{
		{"WebP 1600", func(b []byte, p string) error { return ConvertAndSaveWebP(b, p, 1600, 80) },
			func(m image.Image) image.Image {
				if m.Bounds().Dx() > 1600 {
					return imaging.Resize(m, 1600, 0, imaging.Lanczos)
				}
				return m
			}},
		{"SquareWebP 1000", func(b []byte, p string) error { return ConvertAndSaveSquareWebP(b, p, 1000, 85) },
			func(m image.Image) image.Image { return imaging.Fill(m, 1000, 1000, imaging.Center, imaging.Lanczos) }},
		{"PNGIcon 256", func(b []byte, p string) error { return ConvertAndSavePNGIcon(b, p, 256) },
			func(m image.Image) image.Image { return imaging.Fill(m, 256, 256, imaging.Center, imaging.Lanczos) }},
		{"PNGLogo 600", func(b []byte, p string) error { return ConvertAndSavePNGLogo(b, p, 600) },
			func(m image.Image) image.Image { return imaging.Resize(m, 600, 0, imaging.Lanczos) }},
		{"JPEGOG 1200x630", func(b []byte, p string) error { return ConvertAndSaveJPEGOGImage(b, p, 1200, 630) },
			func(m image.Image) image.Image { return imaging.Fit(m, 1200, 630, imaging.Lanczos) }},
	}
	for o := uint16(1); o <= 8; o++ {
		data := withExifOrientation(jpg, o)
		upright, err := imaging.Decode(bytes.NewReader(data), imaging.AutoOrientation(true))
		if err != nil {
			t.Fatal(err)
		}
		for _, c := range convs {
			out := filepath.Join(dir, "out")
			if err := c.run(data, out); err != nil {
				t.Fatalf("orientation %d %s: %v", o, c.name, err)
			}
			raw, err := os.ReadFile(out)
			if err != nil {
				t.Fatal(err)
			}
			got, _, err := image.Decode(bytes.NewReader(raw))
			if err != nil {
				t.Fatalf("orientation %d %s: decode output: %v", o, c.name, err)
			}
			want := c.ref(upright)
			if got.Bounds().Size() != want.Bounds().Size() {
				t.Fatalf("orientation %d %s: size %v, want %v", o, c.name, got.Bounds().Size(), want.Bounds().Size())
			}
			if o == 6 || o == 8 {
				if s := got.Bounds().Size(); c.name == "WebP 1600" && (s.X != 1600 || s.Y != 2133) {
					t.Fatalf("orientation %d: a portrait photo must stay portrait, got %v", o, s)
				}
			}
			// Sample the middle of each quadrant of the output against the reference.
			b, wb := got.Bounds(), want.Bounds()
			for _, f := range [][2]float64{{0.2, 0.2}, {0.8, 0.2}, {0.2, 0.8}, {0.8, 0.8}} {
				g := color.NRGBAModel.Convert(got.At(b.Min.X+int(f[0]*float64(b.Dx())), b.Min.Y+int(f[1]*float64(b.Dy())))).(color.NRGBA)
				w := color.NRGBAModel.Convert(want.At(wb.Min.X+int(f[0]*float64(wb.Dx())), wb.Min.Y+int(f[1]*float64(wb.Dy())))).(color.NRGBA)
				if absDiff(g.R, w.R) > 24 || absDiff(g.G, w.G) > 24 || absDiff(g.B, w.B) > 24 {
					t.Fatalf("orientation %d %s at %v: got %v, want %v", o, c.name, f, g, w)
				}
			}
		}
	}
}

func absDiff(a, b uint8) int {
	if a > b {
		return int(a - b)
	}
	return int(b - a)
}

// Scaling before orienting gives the old orient-then-scale result for every EXIF orientation, for both
// the width-capped resize and the center-crop fill: at most 1 level of rounding on a few pixels (the
// mirrored Lanczos weights are summed in another order); fills, and resizes for orientations 1, 2, 5
// and 6, are byte-identical.
func TestScaleBeforeOrientMatchesOldOrder(t *testing.T) {
	img := photoLike(900, 700)
	maxDiff := func(a, b []byte) int {
		m := 0
		for i := range a {
			if d := absDiff(a[i], b[i]); d > m {
				m = d
			}
		}
		return m
	}
	for o := 1; o <= 8; o++ {
		d := &decodedUpload{img: img, orient: o}
		w, h, resize := d.widthCappedSize(500)
		if !resize {
			t.Fatal("expected a resize")
		}
		want := imaging.Resize(orientImage(img, o), 500, 0, imaging.Lanczos)
		got := toNRGBA(d.resizeOriented(w, h))
		if got.Rect != want.Rect || maxDiff(got.Pix, want.Pix) > 1 {
			t.Fatalf("orientation %d: resize differs from orient-then-resize (%v vs %v)", o, got.Rect, want.Rect)
		}
		if (o == 1 || o == 2 || o == 5 || o == 6) && !bytes.Equal(got.Pix, want.Pix) {
			t.Fatalf("orientation %d: resize must be byte-identical", o)
		}
		wantFill := imaging.Fill(orientImage(img, o), 300, 300, imaging.Center, imaging.Lanczos)
		if gotFill := toNRGBA(d.fillOriented(300, 300)); gotFill.Rect != wantFill.Rect || !bytes.Equal(gotFill.Pix, wantFill.Pix) {
			t.Fatalf("orientation %d: fill differs from orient-then-fill", o)
		}
	}
}
