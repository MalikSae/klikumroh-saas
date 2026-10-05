package util

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
)

// A failed upload must never damage the file already stored at a fixed path (agent transfer proof,
// travel logo): the new image is encoded to a temporary file and only renamed over the old one
// once encoding succeeded (bug hunt 2, 5 Oct 2026).
func TestSaveAtomically_FailedEncodeKeepsOldFile(t *testing.T) {
	dir := t.TempDir()
	dest := filepath.Join(dir, "bukti-transfer.webp")
	if err := os.WriteFile(dest, []byte("old proof"), 0644); err != nil {
		t.Fatal(err)
	}

	boom := errors.New("encoder failed halfway")
	err := saveAtomically(dest, func(w io.Writer) error {
		_, _ = w.Write([]byte("half a new im"))
		return boom
	})
	if !errors.Is(err, boom) {
		t.Fatalf("expected encoder error, got %v", err)
	}
	if b, _ := os.ReadFile(dest); string(b) != "old proof" {
		t.Fatalf("old file changed after a failed save: %q", b)
	}
	if entries, _ := os.ReadDir(dir); len(entries) != 1 {
		t.Fatalf("temporary file left behind: %d entries", len(entries))
	}

	if err := saveAtomically(dest, func(w io.Writer) error {
		_, err := w.Write([]byte("new proof"))
		return err
	}); err != nil {
		t.Fatalf("save: %v", err)
	}
	if b, _ := os.ReadFile(dest); string(b) != "new proof" {
		t.Fatalf("successful save did not replace the file: %q", b)
	}
}
