package handler_test

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"hash/crc32"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"klikumroh/internal/util"
)

// pixelBombPNG: a ~60-byte PNG whose header declares width x height (8-bit grayscale).
func pixelBombPNG(width, height uint32) []byte {
	var buf bytes.Buffer
	buf.Write([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'})
	ihdr := make([]byte, 13)
	binary.BigEndian.PutUint32(ihdr[0:4], width)
	binary.BigEndian.PutUint32(ihdr[4:8], height)
	ihdr[8] = 8
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

func multipartFile(t *testing.T, field, name string, data []byte, extra map[string]string) (*bytes.Buffer, string) {
	t.Helper()
	body := &bytes.Buffer{}
	w := multipart.NewWriter(body)
	for k, v := range extra {
		_ = w.WriteField(k, v)
	}
	part, err := w.CreateFormFile(field, name)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = part.Write(data)
	_ = w.Close()
	return body, w.FormDataContentType()
}

// H2: agent profile photo refuses a pixel bomb with 400 + the Indonesian message, and refuses a body
// over the 5 MB cap with 400 (MaxBytesReader) instead of reading it into memory.
func TestUploadLimits_AgentProfilePhoto(t *testing.T) {
	agentRouter, _, _, _, _, _, _, _, _, _, _, _, sess1 := setupAgentPayoutTestEnv()
	defer os.RemoveAll(filepath.Join(".", "uploads", "1"))

	post := func(data []byte) *httptest.ResponseRecorder {
		body, ct := multipartFile(t, "photo", "bomb.png", data, nil)
		req := httptest.NewRequest(http.MethodPost, "/api/agent/profile/photo", body)
		req.Header.Set("Authorization", "Bearer "+sess1.Token)
		req.Header.Set("Content-Type", ct)
		rr := httptest.NewRecorder()
		agentRouter.ServeHTTP(rr, req)
		return rr
	}

	rr := post(pixelBombPNG(40000, 40000))
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("pixel bomb: expected 400, got %d (%s)", rr.Code, rr.Body.String())
	}
	var res map[string]string
	_ = json.Unmarshal(rr.Body.Bytes(), &res)
	if res["error"] != util.ErrImageTooLarge.Error() {
		t.Fatalf("pixel bomb: unexpected message %q", res["error"])
	}

	if rr := post(bytes.Repeat([]byte{0}, 6<<20)); rr.Code != http.StatusBadRequest {
		t.Fatalf("6 MB body: expected 400, got %d (%s)", rr.Code, rr.Body.String())
	}
}

// H2: renewal request refuses a pixel-bomb proof (400 + message) and a body over the 10 MB cap.
func TestUploadLimits_RenewalRequest(t *testing.T) {
	_, _, _, _, _, _, r := setupSubTestEnv()

	post := func(data []byte) *httptest.ResponseRecorder {
		body, ct := multipartFile(t, "proof_file", "bomb.png", data, map[string]string{"plan_id": "1"})
		req := httptest.NewRequest(http.MethodPost, "/api/dashboard/subscription/renewal-request", body)
		req.Header.Set("Authorization", "Bearer token-tenant-53")
		req.Header.Set("Content-Type", ct)
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)
		return rr
	}

	rr := post(pixelBombPNG(40000, 40000))
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("pixel bomb: expected 400, got %d (%s)", rr.Code, rr.Body.String())
	}
	var res map[string]string
	_ = json.Unmarshal(rr.Body.Bytes(), &res)
	if res["error"] != util.ErrImageTooLarge.Error() {
		t.Fatalf("pixel bomb: unexpected message %q", res["error"])
	}

	if rr := post(bytes.Repeat([]byte{0}, 11<<20)); rr.Code != http.StatusBadRequest {
		t.Fatalf("11 MB body: expected 400, got %d (%s)", rr.Code, rr.Body.String())
	}
}
