package repository

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
)

// ErrLegalDocumentEmpty is returned when publishing a document whose draft is empty.
var ErrLegalDocumentEmpty = errors.New("isi dokumen masih kosong")

// LegalDocument is one of the platform's legal pages (fixed slugs, see service.LegalSlugs). The draft is what
// staff edit; Published* is what the public page shows, copied from the draft by Publish.
type LegalDocument struct {
	Slug  string `json:"slug"`
	Title string `json:"title"`
	// Draft is the text staff are editing.
	Draft string `json:"draft_content"`
	// PublishedTitle, PublishedContent and PublishedAt are nil while the document is not published.
	PublishedTitle   *string    `json:"published_title"`
	PublishedContent *string    `json:"published_content,omitempty"`
	PublishedAt      *time.Time `json:"published_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
	// Published and HasUnpublishedChanges are derived (see fill).
	Published             bool `json:"published"`
	HasUnpublishedChanges bool `json:"has_unpublished_changes"`
}

// LegalDocumentRepository is the only access path to legal_documents.
type LegalDocumentRepository interface {
	List(ctx context.Context) ([]LegalDocument, error)
	Get(ctx context.Context, slug string) (*LegalDocument, error)
	// SaveDraft stores the title and text of the draft; the published version is untouched.
	SaveDraft(ctx context.Context, slug, title, content string, staffUserID uint64) error
	// Publish copies the draft to the published version (ErrLegalDocumentEmpty when the draft is blank).
	Publish(ctx context.Context, slug string, staffUserID uint64) error
	// Unpublish hides the document from the public page; the draft stays.
	Unpublish(ctx context.Context, slug string) error
}

type mysqlLegalDocumentRepository struct {
	db *sql.DB
}

// NewLegalDocumentRepository creates a LegalDocumentRepository.
func NewLegalDocumentRepository(db *sql.DB) LegalDocumentRepository {
	return &mysqlLegalDocumentRepository{db: db}
}

const legalColumns = `slug, title, draft_content, published_title, published_content, published_at, updated_at`

func scanLegal(row rowScanner) (LegalDocument, error) {
	var d LegalDocument
	var pt, pc sql.NullString
	var pa sql.NullTime
	if err := row.Scan(&d.Slug, &d.Title, &d.Draft, &pt, &pc, &pa, &d.UpdatedAt); err != nil {
		return d, err
	}
	if pt.Valid {
		d.PublishedTitle = &pt.String
	}
	if pc.Valid {
		d.PublishedContent = &pc.String
	}
	if pa.Valid {
		t := pa.Time
		d.PublishedAt = &t
	}
	d.fill()
	return d, nil
}

// fill derives Published and HasUnpublishedChanges. Line endings are compared as \n so a browser's \r\n
// does not make an untouched draft look changed.
func (d *LegalDocument) fill() {
	d.Published = d.PublishedContent != nil && d.PublishedAt != nil
	if !d.Published {
		d.HasUnpublishedChanges = false
		return
	}
	norm := func(s string) string { return strings.TrimSpace(strings.ReplaceAll(s, "\r\n", "\n")) }
	pt := ""
	if d.PublishedTitle != nil {
		pt = *d.PublishedTitle
	}
	d.HasUnpublishedChanges = norm(d.Draft) != norm(*d.PublishedContent) || strings.TrimSpace(d.Title) != strings.TrimSpace(pt)
}

func (r *mysqlLegalDocumentRepository) List(ctx context.Context) ([]LegalDocument, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+legalColumns+` FROM legal_documents ORDER BY slug`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]LegalDocument, 0, 2)
	for rows.Next() {
		d, err := scanLegal(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (r *mysqlLegalDocumentRepository) Get(ctx context.Context, slug string) (*LegalDocument, error) {
	d, err := scanLegal(r.db.QueryRowContext(ctx, `SELECT `+legalColumns+` FROM legal_documents WHERE slug = ?`, slug))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &d, nil
}

func (r *mysqlLegalDocumentRepository) SaveDraft(ctx context.Context, slug, title, content string, staffUserID uint64) error {
	res, err := r.db.ExecContext(ctx,
		`UPDATE legal_documents SET title = ?, draft_content = ?, updated_by = ? WHERE slug = ?`, title, content, staffUserID, slug)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		// Nothing changed (same text saved again) or no such slug.
		if _, err := r.Get(ctx, slug); err != nil {
			return err
		}
	}
	return nil
}

func (r *mysqlLegalDocumentRepository) Publish(ctx context.Context, slug string, staffUserID uint64) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var title, draft string
	if err := tx.QueryRowContext(ctx, `SELECT title, draft_content FROM legal_documents WHERE slug = ? FOR UPDATE`, slug).Scan(&title, &draft); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	if strings.TrimSpace(draft) == "" {
		return ErrLegalDocumentEmpty
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE legal_documents SET published_title = ?, published_content = ?, published_at = NOW(), published_by = ? WHERE slug = ?`,
		title, draft, staffUserID, slug); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *mysqlLegalDocumentRepository) Unpublish(ctx context.Context, slug string) error {
	if _, err := r.Get(ctx, slug); err != nil {
		return err
	}
	_, err := r.db.ExecContext(ctx,
		`UPDATE legal_documents SET published_title = NULL, published_content = NULL, published_at = NULL, published_by = NULL WHERE slug = ?`, slug)
	return err
}
