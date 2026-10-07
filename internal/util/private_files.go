package util

import (
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

// PrivateUploadsDir holds files that must never be served publicly (transfer proofs contain names, bank
// accounts and amounts). They are read only through authenticated endpoints; see handler/private_files.go.
// The stored reference keeps the "/uploads/{tenant}/..." form so existing database values stay valid.
const PrivateUploadsDir = "storage/private"

// Private file kinds.
const (
	PrivateSubscriptionProof = "subscription-proof"
	PrivateAgentProof        = "agent-proof"
	// PrivateProspectProof is a jamaah payment proof an agent uploaded (closing DP or pelunasan), 7 Oct 2026:
	// "/uploads/{tenant}/agents/{agent}/prospect-proofs/{uuid}.webp".
	PrivateProspectProof = "prospect-proof"
)

var privateUploadPattern = regexp.MustCompile(`^/uploads/(\d+)/(?:subscription-proofs/[A-Za-z0-9._-]+\.webp|agents/(\d+)/(bukti-transfer\.webp|prospect-proofs/[A-Za-z0-9._-]+\.webp))$`)

// PrivateUpload describes a private file reference.
type PrivateUpload struct {
	TenantID uint64
	AgentID  uint64 // PrivateAgentProof and PrivateProspectProof
	Kind     string
}

// ParsePrivateUpload recognises a private file reference ("/uploads/{tenant}/subscription-proofs/{uuid}.webp"
// or "/uploads/{tenant}/agents/{agent}/bukti-transfer.webp"). Anything else, including path traversal,
// is rejected.
func ParsePrivateUpload(ref string) (PrivateUpload, bool) {
	m := privateUploadPattern.FindStringSubmatch(ref)
	if m == nil || strings.Contains(ref, "..") {
		return PrivateUpload{}, false
	}
	tenantID, err := strconv.ParseUint(m[1], 10, 64)
	if err != nil {
		return PrivateUpload{}, false
	}
	if m[2] == "" {
		return PrivateUpload{TenantID: tenantID, Kind: PrivateSubscriptionProof}, true
	}
	agentID, err := strconv.ParseUint(m[2], 10, 64)
	if err != nil {
		return PrivateUpload{}, false
	}
	if strings.HasPrefix(m[3], "prospect-proofs/") {
		return PrivateUpload{TenantID: tenantID, AgentID: agentID, Kind: PrivateProspectProof}, true
	}
	return PrivateUpload{TenantID: tenantID, AgentID: agentID, Kind: PrivateAgentProof}, true
}

// IsPrivateUploadPath reports whether a public /uploads request path points at a private file.
func IsPrivateUploadPath(urlPath string) bool {
	p := "/" + strings.TrimLeft(urlPath, "/")
	if !strings.HasPrefix(p, "/uploads/") {
		p = "/uploads" + p
	}
	return strings.Contains(p, "/subscription-proofs") || strings.Contains(p, "/bukti-transfer") || strings.Contains(p, "/prospect-proofs")
}

// PrivateUploadAbsPath is where a private file reference is written.
func PrivateUploadAbsPath(ref string) string {
	rest := strings.TrimPrefix(ref, "/uploads/")
	return filepath.Join(".", PrivateUploadsDir, filepath.FromSlash(rest))
}

// ResolvePrivateUpload returns the file on disk for a valid reference: the private location, or the
// legacy public location for files stored before the move.
func ResolvePrivateUpload(ref string) (string, bool) {
	if _, ok := ParsePrivateUpload(ref); !ok {
		return "", false
	}
	for _, p := range []string{
		PrivateUploadAbsPath(ref),
		filepath.Join(".", "uploads", filepath.FromSlash(strings.TrimPrefix(ref, "/uploads/"))),
	} {
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p, true
		}
	}
	return "", false
}
