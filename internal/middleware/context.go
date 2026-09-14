package middleware

import (
	"context"
)

type contextKey string

const (
	// TenantIDKey is the context key for storing the resolved tenant ID.
	TenantIDKey contextKey = "klikumroh.tenant_id"
	// AdminUserIDKey is the context key for storing the authenticated admin user ID.
	AdminUserIDKey contextKey = "klikumroh.admin_user_id"
	// AgentIDKey is the context key for storing the authenticated agent ID.
	AgentIDKey contextKey = "klikumroh.agent_id"
	// StaffUserIDKey is the context key for storing the authenticated staff user ID.
	StaffUserIDKey contextKey = "klikumroh.staff_user_id"
)

// WithTenantID returns a new context with the given tenant ID.
func WithTenantID(ctx context.Context, tenantID uint64) context.Context {
	return context.WithValue(ctx, TenantIDKey, tenantID)
}

// GetTenantID retrieves the tenant ID from the context if present.
func GetTenantID(ctx context.Context) (uint64, bool) {
	val := ctx.Value(TenantIDKey)
	if val == nil {
		return 0, false
	}
	id, ok := val.(uint64)
	return id, ok
}

// WithAdminUserID returns a new context with the given admin user ID.
func WithAdminUserID(ctx context.Context, adminUserID uint64) context.Context {
	return context.WithValue(ctx, AdminUserIDKey, adminUserID)
}

// GetAdminUserID retrieves the admin user ID from the context if present.
func GetAdminUserID(ctx context.Context) (uint64, bool) {
	val := ctx.Value(AdminUserIDKey)
	if val == nil {
		return 0, false
	}
	id, ok := val.(uint64)
	return id, ok
}

// WithAgentID returns a new context with the given agent ID.
func WithAgentID(ctx context.Context, agentID uint64) context.Context {
	return context.WithValue(ctx, AgentIDKey, agentID)
}

// GetAgentID retrieves the agent ID from the context if present.
func GetAgentID(ctx context.Context) (uint64, bool) {
	val := ctx.Value(AgentIDKey)
	if val == nil {
		return 0, false
	}
	id, ok := val.(uint64)
	return id, ok
}

// WithStaffUserID returns a new context with the given staff user ID.
func WithStaffUserID(ctx context.Context, staffUserID uint64) context.Context {
	return context.WithValue(ctx, StaffUserIDKey, staffUserID)
}

// GetStaffUserID retrieves the staff user ID from the context if present.
func GetStaffUserID(ctx context.Context) (uint64, bool) {
	val := ctx.Value(StaffUserIDKey)
	if val == nil {
		return 0, false
	}
	id, ok := val.(uint64)
	return id, ok
}

