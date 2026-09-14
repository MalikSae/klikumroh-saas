package repository

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// AgentSession represents the data model for the agent_sessions table.
type AgentSession struct {
	ID          uint64    `json:"id"`
	AgentID     uint64    `json:"agent_id"`
	Token       string    `json:"token"`
	TenantID    uint64    `json:"tenant_id"`    // Populated via JOIN with agents
	AgentStatus string    `json:"agent_status"` // Populated via JOIN with agents
	ExpiresAt   time.Time `json:"expires_at"`
	CreatedAt   time.Time `json:"created_at"`
}

// AgentSessionRepository defines access methods for agent_sessions records.
type AgentSessionRepository interface {
	Create(ctx context.Context, session *AgentSession) error
	FindByToken(ctx context.Context, token string) (*AgentSession, error)
	DeleteByToken(ctx context.Context, token string) error
	DeleteByAgentID(ctx context.Context, agentID uint64) error
	Delete(ctx context.Context, id uint64) error
}

type mysqlAgentSessionRepository struct {
	db *sql.DB
}

// NewAgentSessionRepository creates a new AgentSessionRepository instance.
func NewAgentSessionRepository(db *sql.DB) AgentSessionRepository {
	return &mysqlAgentSessionRepository{db: db}
}

func (r *mysqlAgentSessionRepository) Create(ctx context.Context, session *AgentSession) error {
	query := `
		INSERT INTO agent_sessions (
			agent_id, token, expires_at
		) VALUES (?, ?, ?)
	`
	result, err := r.db.ExecContext(ctx, query,
		session.AgentID,
		session.Token,
		session.ExpiresAt,
	)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	session.ID = uint64(id)
	return nil
}

func (r *mysqlAgentSessionRepository) FindByToken(ctx context.Context, token string) (*AgentSession, error) {
	query := `
		SELECT s.id, s.agent_id, s.token, s.expires_at, s.created_at,
		       a.tenant_id, a.status
		FROM agent_sessions s
		JOIN agents a ON s.agent_id = a.id
		WHERE s.token = ?
	`
	row := r.db.QueryRowContext(ctx, query, token)
	var s AgentSession
	err := row.Scan(
		&s.ID,
		&s.AgentID,
		&s.Token,
		&s.ExpiresAt,
		&s.CreatedAt,
		&s.TenantID,
		&s.AgentStatus,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &s, nil
}

func (r *mysqlAgentSessionRepository) DeleteByToken(ctx context.Context, token string) error {
	query := `DELETE FROM agent_sessions WHERE token = ?`
	res, err := r.db.ExecContext(ctx, query, token)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *mysqlAgentSessionRepository) DeleteByAgentID(ctx context.Context, agentID uint64) error {
	query := `DELETE FROM agent_sessions WHERE agent_id = ?`
	_, err := r.db.ExecContext(ctx, query, agentID)
	return err
}

func (r *mysqlAgentSessionRepository) Delete(ctx context.Context, id uint64) error {
	query := `DELETE FROM agent_sessions WHERE id = ?`
	res, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}
