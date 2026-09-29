package service

import "testing"

// P1: the Marketing API version is configurable and never falls back to an expired default.
func TestMetaGraphVersion(t *testing.T) {
	t.Setenv("META_GRAPH_VERSION", "")
	if v := metaGraphVersion(); v != "v25.0" {
		t.Fatalf("default must be v25.0, got %s", v)
	}
	t.Setenv("META_GRAPH_VERSION", "v26.0")
	if v := metaGraphVersion(); v != "v26.0" {
		t.Fatalf("env override must be used, got %s", v)
	}
	for _, bad := range []string{"26.0", "v26", "v26.0/../x", "latest"} {
		t.Setenv("META_GRAPH_VERSION", bad)
		if v := metaGraphVersion(); v != "v25.0" {
			t.Fatalf("invalid %q must fall back to the default, got %s", bad, v)
		}
	}
}
