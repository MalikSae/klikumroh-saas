package handler

import (
	"net/http"
	"os"

	"klikumroh/internal/middleware"
	"klikumroh/internal/util"
)

// Private files (transfer proofs) are served only to whoever may see them, never from /uploads:
//   - GET /api/dashboard/files?path=...  travel admin: own tenant's subscription and agent proofs
//   - GET /api/staff/files?path=...      platform staff: subscription proofs of any tenant (payment review)
//   - GET /api/agent/files?path=...      agent: only their own registration proof
// The path is the reference stored in the database ("/uploads/{tenant}/...").

func servePrivateFile(w http.ResponseWriter, r *http.Request, abs string) {
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeFile(w, r, abs)
}

func privateFileNotFound(w http.ResponseWriter) {
	respondJSON(w, http.StatusNotFound, map[string]string{"error": "berkas tidak ditemukan"})
}

// ServeDashboardPrivateFile handles GET /api/dashboard/files.
func ServeDashboardPrivateFile(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	ref := r.URL.Query().Get("path")
	info, ok := util.ParsePrivateUpload(ref)
	// 404 (not 403) for another tenant's file, so its existence is not revealed.
	if !ok || info.TenantID != tenantID {
		privateFileNotFound(w)
		return
	}
	abs, ok := util.ResolvePrivateUpload(ref)
	if !ok {
		privateFileNotFound(w)
		return
	}
	servePrivateFile(w, r, abs)
}

// ServeStaffPrivateFile handles GET /api/staff/files (behind StaffAuthMiddleware). Staff only review
// subscription payments here, so only subscription proofs are served. An agent's registration proof
// belongs to the travel: staff see it only by impersonating the travel, which is written to its access
// log (GET /api/dashboard/files).
func ServeStaffPrivateFile(w http.ResponseWriter, r *http.Request) {
	ref := r.URL.Query().Get("path")
	if info, ok := util.ParsePrivateUpload(ref); !ok || info.Kind != util.PrivateSubscriptionProof {
		privateFileNotFound(w)
		return
	}
	abs, ok := util.ResolvePrivateUpload(ref)
	if !ok {
		privateFileNotFound(w)
		return
	}
	servePrivateFile(w, r, abs)
}

// ServeAgentPrivateFile handles GET /api/agent/files (behind AgentAuthMiddleware).
func ServeAgentPrivateFile(w http.ResponseWriter, r *http.Request) {
	tenantID, ok1 := middleware.GetTenantID(r.Context())
	agentID, ok2 := middleware.GetAgentID(r.Context())
	if !ok1 || !ok2 {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	ref := r.URL.Query().Get("path")
	info, ok := util.ParsePrivateUpload(ref)
	if !ok || info.Kind != util.PrivateAgentProof || info.TenantID != tenantID || info.AgentID != agentID {
		privateFileNotFound(w)
		return
	}
	abs, ok := util.ResolvePrivateUpload(ref)
	if !ok {
		privateFileNotFound(w)
		return
	}
	servePrivateFile(w, r, abs)
}

// PublicUploadsHandler serves /uploads (development; production serves it from the web server) without
// directory listings and without private files.
func PublicUploadsHandler(dir string) http.Handler {
	fs := http.StripPrefix("/uploads/", http.FileServer(noListingFS{http.Dir(dir)}))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if util.IsPrivateUploadPath(r.URL.Path) {
			http.NotFound(w, r)
			return
		}
		fs.ServeHTTP(w, r)
	})
}

// noListingFS hides directories, so /uploads/{tenant}/ cannot be browsed.
type noListingFS struct{ fs http.FileSystem }

func (n noListingFS) Open(name string) (http.File, error) {
	f, err := n.fs.Open(name)
	if err != nil {
		return nil, err
	}
	st, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return nil, err
	}
	if st.IsDir() {
		_ = f.Close()
		return nil, os.ErrNotExist
	}
	return f, nil
}
