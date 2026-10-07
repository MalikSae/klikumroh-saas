package util

import "testing"

// Isolation audit I2: only the two private file shapes are accepted; traversal and other paths are not.
func TestParsePrivateUpload(t *testing.T) {
	cases := []struct {
		ref    string
		ok     bool
		kind   string
		tenant uint64
		agent  uint64
	}{
		{"/uploads/12/subscription-proofs/9f1c2d3e-aaaa-bbbb-cccc-1234567890ab.webp", true, PrivateSubscriptionProof, 12, 0},
		{"/uploads/12/agents/34/bukti-transfer.webp", true, PrivateAgentProof, 12, 34},
		{"/uploads/12/agents/34/prospect-proofs/9f1c2d3e-aaaa-bbbb-cccc-1234567890ab.webp", true, PrivateProspectProof, 12, 34},
		{"/uploads/12/agents/34/prospect-proofs/../../../13/x.webp", false, "", 0, 0},
		{"/uploads/12/agents/34/prospect-proofs/x.png", false, "", 0, 0},
		{"/uploads/12/subscription-proofs/../../13/subscription-proofs/x.webp", false, "", 0, 0},
		{"/uploads/12/packages/5/photo.webp", false, "", 0, 0},
		{"/uploads/12/agents/34/photo.webp", false, "", 0, 0},
		{"../../etc/passwd", false, "", 0, 0},
		{"", false, "", 0, 0},
	}
	for _, c := range cases {
		got, ok := ParsePrivateUpload(c.ref)
		if ok != c.ok || (ok && (got.Kind != c.kind || got.TenantID != c.tenant || got.AgentID != c.agent)) {
			t.Errorf("%q: got %+v ok=%v, want kind=%s tenant=%d agent=%d ok=%v", c.ref, got, ok, c.kind, c.tenant, c.agent, c.ok)
		}
	}
	for path, want := range map[string]bool{
		"/uploads/12/subscription-proofs/x.webp":   true,
		"/12/subscription-proofs/":                 true,
		"/uploads/12/agents/3/bukti-transfer.webp": true,
		"/uploads/12/packages/5/photo.webp":        false,
	} {
		if IsPrivateUploadPath(path) != want {
			t.Errorf("IsPrivateUploadPath(%q) != %v", path, want)
		}
	}
}
