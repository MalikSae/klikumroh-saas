package middleware

import (
	"net/http"

	"klikumroh/internal/repository"
)

// RequirePICMessage is the error shown to a team member whose role is not PIC.
const RequirePICMessage = "Hanya PIC travel yang dapat melakukan tindakan ini."

// RequirePIC lets a request through only when the signed-in admin is the travel's PIC (person in charge).
// It must run after AuthMiddleware. The role is read from the database on every request (not from the
// session), so demoting or deactivating a PIC takes effect immediately. A KlikUmroh staff impersonation
// session passes: staff access is already recorded request by request in access_logs.
func RequirePIC(adminUserRepo repository.AdminUserRepository) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if _, impersonating := GetImpersonatingStaffID(r.Context()); impersonating {
				next.ServeHTTP(w, r)
				return
			}
			tenantID, okTenant := GetTenantID(r.Context())
			adminID, okAdmin := GetAdminUserID(r.Context())
			if !okTenant || !okAdmin {
				respondUnauthorized(w)
				return
			}
			user, err := adminUserRepo.GetByID(r.Context(), tenantID, adminID)
			if err != nil || user.Status != "active" {
				respondUnauthorized(w)
				return
			}
			if user.Role != repository.RolePIC {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				_, _ = w.Write([]byte(`{"error":"` + RequirePICMessage + `","code":"pic_required"}`))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
