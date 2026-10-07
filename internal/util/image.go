package util

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"image/png"
	"io"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
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
	ErrImageTooLarge = errors.New("resolusi gambar terlalu besar (maksimal 8.000 piksel per sisi dan 24 megapiksel), perkecil gambar lalu unggah lagi")
	// ErrImageTooHeavy: a high bit-depth image (16 bits per channel) whose decoded size would pass
	// MaxDecodedImageBytes although its pixel count is within MaxImagePixels. Answered 400.
	ErrImageTooHeavy = errors.New("gambar 16-bit ini terlalu besar untuk diproses, simpan ulang sebagai JPG atau PNG 8-bit lalu unggah lagi")
	// ErrJPEGTooHeavy: a progressive JPEG whose decode would need more than MaxJPEGDecodeBytes (the decoder
	// keeps every DCT coefficient in RAM until the last scan). Answered 400.
	ErrJPEGTooHeavy = errors.New("gambar JPG ini terlalu berat untuk diproses, perkecil gambar atau simpan ulang sebagai JPG biasa lalu unggah lagi")
	// ErrImageBusy: every decode slot stayed taken for imageDecodeWait. Handlers answer 503 with this message.
	ErrImageBusy = errors.New("Server sedang memproses gambar lain, coba lagi sebentar.")
)

// Pixel limits checked from the image header before decoding. A small compressed file (e.g. a ~200 KB
// PNG declaring 40000x40000) would otherwise decode into gigabytes of RAM and take the API down for
// every tenant. MaxDecodedImageBytes also caps the decoded size: a 16-bit PNG decodes to 8 bytes per
// pixel, so it is held to 12 MP while 8-bit images get the full 24 MP.
//
// The numbers are sized for a 2 GB VPS that also runs MySQL and Next.js (measured 6 Oct 2026 with
// TestImageMemoryReport, Go heap, default GOGC): the heaviest accepted upload peaks at ~170 MiB per
// conversion (a 3000x8000 PNG to 1600px WebP; a 24 MP phone JPEG peaks at ~100 MiB), so the two decode
// slots stay under ~340 MiB together. Before (12000 px, 40 MP, 256 MiB, rotation and crop copies at full
// size) the worst case was ~430 MiB per conversion, ~860 MiB for two. A 24 MP limit still accepts the
// usual phone photo (12-24 MP; 48-50 MP sensors save 12 MP binned photos by default); larger photos must
// be downscaled first (the error message says so). Raising it costs ~4 MiB per extra megapixel per slot.
const (
	MaxImageSide         = 8000
	MaxImagePixels       = 24_000_000
	MaxDecodedImageBytes = 96 << 20
)

// Decode concurrency: at most maxConcurrentImageDecodes conversions hold a decoded image at a time
// (each peaks at ~170 MiB at the limits above, see there), so parallel uploads cannot push
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
	if extra := jpegCoefficientBytes(fileBytes, pixels); extra > 0 && pixels*4+extra > MaxJPEGDecodeBytes {
		return ErrJPEGTooHeavy
	}
	return nil
}

// MaxJPEGDecodeBytes caps what a progressive JPEG decode holds at its peak: the decoded image (counted as
// 4 bytes per pixel, like decodedBytesPerPixel) plus Go's coefficient buffer. Go's image/jpeg keeps every
// 8x8 block's 64 int32 coefficients (256 bytes, i.e. 4 bytes per pixel per full-resolution component)
// until the last scan, and allocates it from the declared size alone, so a few-KB file declaring 24 MP
// 4:4:4 would cost ~360 MiB (CMYK ~480 MiB) per decode (security audit 7 Oct 2026). 160 MiB keeps the
// peak near the ~170 MiB per slot measured for the other uploads: a usual 4:2:0 progressive photo passes
// up to ~16 MP, 4:4:4 up to ~10 MP, CMYK up to ~8 MP. Baseline JPEGs have no such buffer.
const MaxJPEGDecodeBytes = 160 << 20

// jpegCoefficientBytes estimates the coefficient buffer Go's decoder allocates for a progressive JPEG
// (0 for baseline JPEGs and for other formats), read from the SOF2/6/10/14 frame header: each component
// costs 4 bytes per pixel scaled by its share of blocks (H*V / Hmax*Vmax, so subsampled chroma costs less).
func jpegCoefficientBytes(b []byte, pixels int64) int64 {
	if len(b) < 4 || b[0] != 0xFF || b[1] != 0xD8 {
		return 0
	}
	for i := 2; i+4 <= len(b); {
		if b[i] != 0xFF {
			return 0 // not at a marker: malformed, the decoder will refuse it
		}
		marker := b[i+1]
		if marker == 0xFF { // fill byte
			i++
			continue
		}
		if marker == 0xD8 || (marker >= 0xD0 && marker <= 0xD7) || marker == 0x01 {
			i += 2
			continue
		}
		if marker == 0xD9 || marker == 0xDA { // EOI or start of scan: no frame header before it
			return 0
		}
		segLen := int(b[i+2])<<8 | int(b[i+3])
		if segLen < 2 || i+2+segLen > len(b) {
			return 0
		}
		seg := b[i+4 : i+2+segLen]
		switch marker {
		case 0xC2, 0xC6, 0xCA, 0xCE: // progressive frame
			if len(seg) < 6 {
				return 0
			}
			n := int(seg[5])
			if n <= 0 || len(seg) < 6+3*n {
				return 0
			}
			hMax, vMax, units := 1, 1, 0
			for c := 0; c < n; c++ {
				hv := seg[6+3*c+1]
				h, v := int(hv>>4), int(hv&0x0F)
				if h > hMax {
					hMax = h
				}
				if v > vMax {
					vMax = v
				}
				units += h * v
			}
			return pixels * 4 * int64(units) / int64(hMax*vMax)
		case 0xC0, 0xC1, 0xC3, 0xC5, 0xC7, 0xC9, 0xCB, 0xCD, 0xCF: // other frame types: no coefficient buffer
			return 0
		}
		i += 2 + segLen
	}
	return 0
}

// decodedUpload is an upload decoded at full size in the orientation it was stored in, plus its EXIF
// orientation (0 or 1: none). The orientation is applied only after the image has been scaled down
// (resizeOriented / orientImage), so rotating a phone photo copies the small image, not the full one.
type decodedUpload struct {
	img          image.Image
	orient       int
	decodedBytes int64 // estimated size of img (pixels x decodedBytesPerPixel)
}

// gcAfterDecodeBytes: when the full-size decode is at least this big, finish runs a garbage collection
// once the image has been scaled down, so the decode (and imaging's first resize pass) are reclaimed
// before the RGBA copy and the encoder allocate. Measured on the tallest 24 MP upload, this lowers the
// peak from ~200 MiB to ~170 MiB; uploads are rare, so the extra collection costs nothing noticeable.
const gcAfterDecodeBytes = 32 << 20

// finish drops the full-size decode once small (the scaled, oriented result) is all that is needed, and
// collects it when it was large. small may be the decoded image itself (nothing was scaled or rotated):
// then there is nothing to reclaim yet.
func (d *decodedUpload) finish(small image.Image) image.Image {
	full := d.img
	d.img = nil
	if d.decodedBytes >= gcAfterDecodeBytes && !sameImage(full, small) {
		runtime.GC()
	}
	return small
}

// sameImage reports whether a and b are the same image value (pointer identity for the usual
// *image.XXX types).
func sameImage(a, b image.Image) (same bool) {
	defer func() {
		if recover() != nil { // non-comparable dynamic type
			same = false
		}
	}()
	return a == b
}

// decodeRecovering decodes the image and turns a decoder panic (a malformed file hitting a decoder bug)
// into an error, so the caller still releases its decode slot instead of leaking it until a restart.
func decodeRecovering(fileBytes []byte) (img image.Image, err error) {
	defer func() {
		if r := recover(); r != nil {
			img, err = nil, fmt.Errorf("decoder panic: %v", r)
		}
	}()
	img, _, err = image.Decode(bytes.NewReader(fileBytes))
	return img, err
}

// decodeUpload validates the format (JPEG/PNG/WebP), checks the declared pixel size before allocating
// anything, takes a decode slot, then decodes and reads the EXIF orientation. The caller must call
// release once it no longer holds the decoded image (after encoding); release is nil when err is not.
func decodeUpload(fileBytes []byte) (*decodedUpload, func(), error) {
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
	img, err := decodeRecovering(fileBytes)
	if err != nil {
		release()
		return nil, nil, fmt.Errorf("%w: %v", ErrCorruptImage, err)
	}
	b := img.Bounds()
	size := int64(b.Dx()) * int64(b.Dy()) * decodedBytesPerPixel(img.ColorModel())
	return &decodedUpload{img: img, orient: readJPEGOrientation(fileBytes), decodedBytes: size}, release, nil
}

// EXIF orientation values (TIFF tag 0x0112).
const (
	orientNormal     = 1
	orientFlipH      = 2
	orientRotate180  = 3
	orientFlipV      = 4
	orientTranspose  = 5
	orientRotate270  = 6
	orientTransverse = 7
	orientRotate90   = 8
)

// readJPEGOrientation returns the EXIF orientation tag of a JPEG (1..8), or 0 when the file is not a
// JPEG, has no EXIF block in its first APP1 segment, or the tag is missing or invalid. It follows the
// same rules as imaging's AutoOrientation reader, which the pipeline used before, so the same photos
// get rotated.
func readJPEGOrientation(b []byte) int {
	const (
		markerAPP1     = 0xffe1
		orientationTag = 0x0112
	)
	if len(b) < 2 || b[0] != 0xff || b[1] != 0xd8 {
		return 0
	}
	p := 2
	// Find the first APP1 segment.
	for {
		if p+4 > len(b) {
			return 0
		}
		marker := binary.BigEndian.Uint16(b[p:])
		size := int(binary.BigEndian.Uint16(b[p+2:]))
		p += 4
		if marker>>8 != 0xff {
			return 0
		}
		if marker == markerAPP1 {
			break
		}
		if size < 2 {
			return 0
		}
		p += size - 2
	}
	// "Exif\0\0" header, then the TIFF header.
	if p+6 > len(b) || string(b[p:p+4]) != "Exif" {
		return 0
	}
	tiff := p + 6
	if tiff+8 > len(b) {
		return 0
	}
	var order binary.ByteOrder
	switch string(b[tiff : tiff+2]) {
	case "MM":
		order = binary.BigEndian
	case "II":
		order = binary.LittleEndian
	default:
		return 0
	}
	offset := int(order.Uint32(b[tiff+4:]))
	if offset < 8 {
		return 0
	}
	p = tiff + offset
	if p+2 > len(b) {
		return 0
	}
	numTags := int(order.Uint16(b[p:]))
	p += 2
	for i := 0; i < numTags; i++ {
		if p+12 > len(b) {
			return 0
		}
		if order.Uint16(b[p:]) == orientationTag {
			v := int(order.Uint16(b[p+8:]))
			if v < 1 || v > 8 {
				return 0
			}
			return v
		}
		p += 12
	}
	return 0
}

// orientTransposes reports whether the orientation swaps width and height.
func orientTransposes(o int) bool {
	return o >= orientTranspose && o <= orientRotate90
}

// orientedSize is the size of the image once its orientation is applied.
func (d *decodedUpload) orientedSize() (int, int) {
	b := d.img.Bounds()
	if orientTransposes(d.orient) {
		return b.Dy(), b.Dx()
	}
	return b.Dx(), b.Dy()
}

// orientImage applies an EXIF orientation (imaging's transforms; 0 and 1 leave img as it is).
func orientImage(img image.Image, o int) image.Image {
	switch o {
	case orientFlipH:
		return imaging.FlipH(img)
	case orientFlipV:
		return imaging.FlipV(img)
	case orientRotate90:
		return imaging.Rotate90(img)
	case orientRotate180:
		return imaging.Rotate180(img)
	case orientRotate270:
		return imaging.Rotate270(img)
	case orientTranspose:
		return imaging.Transpose(img)
	case orientTransverse:
		return imaging.Transverse(img)
	}
	return img
}

// oriented returns the full-size image with its orientation applied. Used when no scaling is needed.
func (d *decodedUpload) oriented() image.Image {
	return orientImage(d.img, d.orient)
}

// resizeOriented scales the stored image so that, once oriented, it measures dstW x dstH (Lanczos),
// then applies the orientation to the scaled result. The full-size decoded image is never copied.
func (d *decodedUpload) resizeOriented(dstW, dstH int) image.Image {
	t := orientTransposes(d.orient)
	if t {
		dstW, dstH = dstH, dstW
	}
	return orientImage(scaleStored(d.img, dstW, dstH, t), d.orient)
}

// scaleStored scales src (still in its stored orientation) to w x h with imaging's Lanczos resize.
// imaging.Resize runs the horizontal pass first, and the old pipeline ran it on the already-oriented
// image. When the orientation swaps the axes, the oriented horizontal pass is the stored vertical one,
// so the two passes are run in that order here: the result then matches rotating first (identical, or
// at most 1 level of rounding where the orientation also mirrors).
func scaleStored(src image.Image, w, h int, transposed bool) image.Image {
	b := src.Bounds()
	if !transposed || b.Dx() == w || b.Dy() == h {
		return imaging.Resize(src, w, h, imaging.Lanczos)
	}
	return imaging.Resize(imaging.Resize(src, b.Dx(), h, imaging.Lanczos), w, h, imaging.Lanczos)
}

// storedRect maps a rectangle given in oriented coordinates (origin at 0,0) to the stored image of size
// storedW x storedH, for the orientation transforms of orientImage.
func storedRect(r image.Rectangle, storedW, storedH, o int) image.Rectangle {
	x0, y0, w, h := r.Min.X, r.Min.Y, r.Dx(), r.Dy()
	flip := func(start, n, length int) int { return length - start - n }
	var sx, sy, sw, sh int
	switch o {
	case orientFlipH:
		sx, sy, sw, sh = flip(x0, w, storedW), y0, w, h
	case orientRotate180:
		sx, sy, sw, sh = flip(x0, w, storedW), flip(y0, h, storedH), w, h
	case orientFlipV:
		sx, sy, sw, sh = x0, flip(y0, h, storedH), w, h
	case orientTranspose:
		sx, sy, sw, sh = y0, x0, h, w
	case orientRotate270:
		sx, sy, sw, sh = y0, flip(x0, w, storedH), h, w
	case orientTransverse:
		sx, sy, sw, sh = flip(y0, h, storedW), flip(x0, w, storedH), h, w
	case orientRotate90:
		sx, sy, sw, sh = flip(y0, h, storedW), x0, h, w
	default:
		sx, sy, sw, sh = x0, y0, w, h
	}
	return image.Rect(sx, sy, sx+sw, sy+sh)
}

// fillOriented is imaging.Fill(oriented image, dstW, dstH, Center, Lanczos) without its full-size copies
// (imaging copies the center crop into a new NRGBA, and orientation copied the whole image before that):
// the same crop rectangle is mapped onto the stored image and used as a sub-image view, scaled, and only
// the small result is oriented.
func (d *decodedUpload) fillOriented(dstW, dstH int) image.Image {
	ow, oh := d.orientedSize()
	view, canView := d.img.(interface {
		SubImage(image.Rectangle) image.Image
	})
	if !canView || ow < 100 || oh < 100 || (ow == dstW && oh == dstH) {
		// Small images (imaging resizes before cropping them) or types without sub-images: the old path.
		return imaging.Fill(d.oriented(), dstW, dstH, imaging.Center, imaging.Lanczos)
	}
	// Same crop size and position as imaging's cropAndResize + CropAnchor(Center).
	cropW, cropH := ow, oh
	if float64(ow)/float64(oh) < float64(dstW)/float64(dstH) {
		cropH = int(math.Max(1, float64(ow)*float64(dstH)/float64(dstW)) + 0.5)
	} else {
		cropW = int(math.Max(1, float64(oh)*float64(dstW)/float64(dstH)) + 0.5)
	}
	crop := image.Rect(0, 0, cropW, cropH).Add(image.Pt((ow-cropW)/2, (oh-cropH)/2)).Intersect(image.Rect(0, 0, ow, oh))

	b := d.img.Bounds()
	t := orientTransposes(d.orient)
	sub := view.SubImage(storedRect(crop, b.Dx(), b.Dy(), d.orient).Add(b.Min))
	if t {
		dstW, dstH = dstH, dstW
	}
	return orientImage(scaleStored(sub, dstW, dstH, t), d.orient)
}

// widthCappedSize is the oriented output size when the width is capped at maxWidth (imaging.Resize with
// height 0), and whether a resize is needed at all.
func (d *decodedUpload) widthCappedSize(maxWidth int) (int, int, bool) {
	w, h := d.orientedSize()
	if w <= maxWidth {
		return w, h, false
	}
	return maxWidth, int(math.Max(1.0, math.Floor(float64(maxWidth)*float64(h)/float64(w)+0.5))), true
}

// toRGBA returns img as an *image.RGBA at the origin, copying only when it is not one already.
func toRGBA(img image.Image) *image.RGBA {
	if r, ok := img.(*image.RGBA); ok && r.Rect.Min == (image.Point{}) {
		return r
	}
	b := img.Bounds()
	out := image.NewRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	draw.Draw(out, out.Bounds(), img, b.Min, draw.Src)
	return out
}

// toNRGBA returns img as an *image.NRGBA at the origin, copying only when it is not one already
// (imaging's resize/transform results already are).
func toNRGBA(img image.Image) *image.NRGBA {
	if n, ok := img.(*image.NRGBA); ok && n.Rect.Min == (image.Point{}) {
		return n
	}
	b := img.Bounds()
	out := image.NewNRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	draw.Draw(out, out.Bounds(), img, b.Min, draw.Src)
	return out
}

// IsImageClientError reports whether an image conversion error is the uploader's fault (wrong format,
// corrupt file, too many pixels) and should be answered 400 with err.Error().
func IsImageClientError(err error) bool {
	return errors.Is(err, ErrInvalidImageFormat) || errors.Is(err, ErrCorruptImage) || errors.Is(err, ErrImageTooLarge) ||
		errors.Is(err, ErrImageTooHeavy) || errors.Is(err, ErrJPEGTooHeavy)
}

// IsImageBusyError reports ErrImageBusy: answered 503 with err.Error() (the upload can be retried).
func IsImageBusyError(err error) bool {
	return errors.Is(err, ErrImageBusy)
}

// ConvertAndSaveWebP validates image format (JPEG/PNG/WebP), auto-orients,
// resizes if wider than maxWidth (default 1600), converts to RGBA,
// and encodes to WebP at destinationPath with the specified quality (default 80).
// Memory: the decoded image is scaled down before it is oriented or converted, so the only full-size
// buffer is the decode itself (plus imaging's first resize pass, maxWidth x original height).
func ConvertAndSaveWebP(fileBytes []byte, destinationPath string, maxWidth int, quality float32) error {
	dec, release, err := decodeUpload(fileBytes)
	if err != nil {
		return err
	}
	defer release()

	if maxWidth <= 0 {
		maxWidth = 1600
	}
	var img image.Image
	if w, h, resize := dec.widthCappedSize(maxWidth); resize {
		img = dec.resizeOriented(w, h)
	} else {
		img = dec.oriented()
	}
	img = dec.finish(img)

	// The full-size decode is no longer referenced from here on, so the GC can reclaim it while encoding.
	// The WebP encoder gets an *image.RGBA, as before (AGENTS.md 3.9: the canvas type changes the output).
	rgbaImg := toRGBA(img)

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
	dec, release, err := decodeUpload(fileBytes)
	if err != nil {
		return err
	}
	defer release()

	if size <= 0 {
		size = 1000
	}
	// Center-crop to 1:1 aspect ratio and resize to size x size
	img := dec.finish(dec.fillOriented(size, size))

	rgbaImg := toRGBA(img)

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
	dec, release, err := decodeUpload(fileBytes)
	if err != nil {
		return err
	}
	defer release()

	if size <= 0 {
		size = 256
	}
	// Center-crop to 1:1 aspect ratio and resize to size x size
	img := dec.finish(dec.fillOriented(size, size))

	nrgbaImg := toNRGBA(img)

	encoder := &png.Encoder{CompressionLevel: png.BestCompression}
	return saveAtomically(destinationPath, func(out io.Writer) error {
		if err := encoder.Encode(out, nrgbaImg); err != nil {
			return fmt.Errorf("gagal mengkonversi ke PNG: %w", err)
		}
		return nil
	})
}

// ConvertAndSavePNGLogo validates image format (JPEG/PNG/WebP), auto-orients,
// resizes proportionally if wider than maxWidth (default 600px),
// and encodes to PNG with BestCompression to preserve crisp alpha transparency for headers.
func ConvertAndSavePNGLogo(fileBytes []byte, destinationPath string, maxWidth int) error {
	dec, release, err := decodeUpload(fileBytes)
	if err != nil {
		return err
	}
	defer release()

	if maxWidth <= 0 {
		maxWidth = 600
	}
	var img image.Image
	if w, h, resize := dec.widthCappedSize(maxWidth); resize {
		img = dec.resizeOriented(w, h)
	} else {
		img = dec.oriented()
	}
	img = dec.finish(img)

	nrgbaImg := toNRGBA(img)

	encoder := &png.Encoder{CompressionLevel: png.BestCompression}
	return saveAtomically(destinationPath, func(out io.Writer) error {
		if err := encoder.Encode(out, nrgbaImg); err != nil {
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
	dec, release, err := decodeUpload(fileBytes)
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

	// Fit proportionally within maxWidth x maxHeight if larger (same sizes as imaging.Fit).
	var img image.Image
	if w, h := dec.orientedSize(); w > maxWidth || h > maxHeight {
		srcAspectRatio := float64(w) / float64(h)
		var newW, newH int
		if srcAspectRatio > float64(maxWidth)/float64(maxHeight) {
			newW = maxWidth
			newH = int(float64(newW) / srcAspectRatio)
		} else {
			newH = maxHeight
			newW = int(float64(newH) * srcAspectRatio)
		}
		img = dec.resizeOriented(newW, newH)
	} else {
		img = dec.oriented()
	}
	img = dec.finish(img)

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
