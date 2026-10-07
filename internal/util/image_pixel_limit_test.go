package util_test

import (
	"bytes"
	"encoding/binary"
	"errors"
	"hash/crc32"
	"path/filepath"
	"testing"

	"klikumroh/internal/util"
)

// PixelBombPNG builds a tiny PNG whose header declares width x height (8-bit grayscale). Only the
// signature and IHDR (with a valid CRC) are real: enough for DetectContentType and image.DecodeConfig,
// while a full decode would try to allocate width*height bytes.
func PixelBombPNG(width, height uint32) []byte {
	var buf bytes.Buffer
	buf.Write([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'})
	ihdr := make([]byte, 13)
	binary.BigEndian.PutUint32(ihdr[0:4], width)
	binary.BigEndian.PutUint32(ihdr[4:8], height)
	ihdr[8] = 8 // bit depth
	ihdr[9] = 0 // color type: grayscale
	writeChunk := func(typ string, data []byte) {
		_ = binary.Write(&buf, binary.BigEndian, uint32(len(data)))
		buf.WriteString(typ)
		buf.Write(data)
		crc := crc32.NewIEEE()
		crc.Write([]byte(typ))
		crc.Write(data)
		_ = binary.Write(&buf, binary.BigEndian, crc.Sum32())
	}
	writeChunk("IHDR", ihdr)
	writeChunk("IDAT", []byte{0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01})
	writeChunk("IEND", nil)
	return buf.Bytes()
}

// H2: every conversion helper refuses a pixel bomb from its header, before decoding.
func TestImagePixelLimit_RefusesPixelBomb(t *testing.T) {
	dir := t.TempDir()
	cases := map[string][]byte{
		"40000x40000":          PixelBombPNG(40000, 40000),
		"side over 8000":       PixelBombPNG(8001, 10),
		"over 24 MP, sides ok": PixelBombPNG(5000, 5000),
	}
	convs := map[string]func([]byte, string) error{
		"WebP":       func(b []byte, p string) error { return util.ConvertAndSaveWebP(b, p, 1600, 80) },
		"SquareWebP": func(b []byte, p string) error { return util.ConvertAndSaveSquareWebP(b, p, 1000, 85) },
		"PNGIcon":    func(b []byte, p string) error { return util.ConvertAndSavePNGIcon(b, p, 256) },
		"PNGLogo":    func(b []byte, p string) error { return util.ConvertAndSavePNGLogo(b, p, 600) },
		"JPEGOG":     func(b []byte, p string) error { return util.ConvertAndSaveJPEGOGImage(b, p, 1200, 630) },
	}
	for cname, data := range cases {
		for fname, conv := range convs {
			t.Run(cname+"/"+fname, func(t *testing.T) {
				err := conv(data, filepath.Join(dir, "out-"+fname))
				if !errors.Is(err, util.ErrImageTooLarge) {
					t.Fatalf("expected ErrImageTooLarge, got %v", err)
				}
				if !util.IsImageClientError(err) {
					t.Fatal("ErrImageTooLarge must be a client (400) error")
				}
			})
		}
	}
}

// H2: an image within the limits still passes the header check (it then fails only on the fake IDAT,
// as a corrupt image, never as too large).
func TestImagePixelLimit_AllowsNormalSizes(t *testing.T) {
	err := util.ConvertAndSaveWebP(PixelBombPNG(4000, 3000), filepath.Join(t.TempDir(), "ok.webp"), 1600, 80)
	if errors.Is(err, util.ErrImageTooLarge) {
		t.Fatalf("12 MP image must not be refused as too large: %v", err)
	}
}
