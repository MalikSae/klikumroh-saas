package repository

import (
	"context"
	"database/sql"
	"time"
)

// ProspectNote represents a freeform note attached to a prospect.
type ProspectNote struct {
	ID         uint64    `json:"id"`
	TenantID   uint64    `json:"tenant_id"`
	ProspectID uint64    `json:"prospect_id"`
	AuthorType string    `json:"author_type"` // 'admin', 'agent'
	AuthorID   uint64    `json:"author_id"`
	AuthorName *string   `json:"author_name,omitempty"`
	NoteText   string    `json:"note_text"`
	CreatedAt  time.Time `json:"created_at"`
}

// ProspectNoteRepository defines access methods for prospect notes.
type ProspectNoteRepository interface {
	Create(ctx context.Context, tenantID uint64, note *ProspectNote) error
	ListByProspect(ctx context.Context, tenantID uint64, prospectID uint64) ([]ProspectNote, error)
}

type mysqlProspectNoteRepository struct {
	db *sql.DB
}

// NewProspectNoteRepository creates a new ProspectNoteRepository.
func NewProspectNoteRepository(db *sql.DB) ProspectNoteRepository {
	return &mysqlProspectNoteRepository{db: db}
}

func (r *mysqlProspectNoteRepository) Create(ctx context.Context, tenantID uint64, note *ProspectNote) error {
	query := `
		INSERT INTO prospect_notes (
			tenant_id, prospect_id, author_type, author_id, note_text
		) VALUES (?, ?, ?, ?, ?)
	`
	note.TenantID = tenantID
	result, err := r.db.ExecContext(ctx, query,
		tenantID,
		note.ProspectID,
		note.AuthorType,
		note.AuthorID,
		note.NoteText,
	)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	note.ID = uint64(id)
	return nil
}

func (r *mysqlProspectNoteRepository) ListByProspect(ctx context.Context, tenantID uint64, prospectID uint64) ([]ProspectNote, error) {
	query := `
		SELECT n.id, n.tenant_id, n.prospect_id, n.author_type, n.author_id,
			n.note_text, n.created_at,
			CASE 
				WHEN n.author_type = 'admin' THEN u.name 
				ELSE NULL 
			END as author_name
		FROM prospect_notes n
		LEFT JOIN admin_users u ON n.author_type = 'admin' AND n.author_id = u.id AND u.tenant_id = n.tenant_id
		WHERE n.tenant_id = ? AND n.prospect_id = ?
		ORDER BY n.created_at DESC, n.id DESC
	`
	rows, err := r.db.QueryContext(ctx, query, tenantID, prospectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var notes []ProspectNote
	for rows.Next() {
		var n ProspectNote
		var authorName sql.NullString

		if err := rows.Scan(
			&n.ID,
			&n.TenantID,
			&n.ProspectID,
			&n.AuthorType,
			&n.AuthorID,
			&n.NoteText,
			&n.CreatedAt,
			&authorName,
		); err != nil {
			return nil, err
		}

		if authorName.Valid {
			n.AuthorName = &authorName.String
		}
		notes = append(notes, n)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return notes, nil
}
