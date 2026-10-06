package repository

import "errors"

var (
	// ErrNotFound is returned when a requested record is not found or does not belong to the specified tenant.
	ErrNotFound = errors.New("record not found")
	// ErrDuplicate is returned when a unique constraint is violated.
	ErrDuplicate = errors.New("duplicate entry")
	// ErrForeignKeyViolation is returned when an operation violates a foreign key constraint.
	ErrForeignKeyViolation = errors.New("foreign key constraint violation")
	// ErrStatusConflict is returned when a conditional status transition finds the record in a different
	// status than expected (e.g. another request already approved it).
	ErrStatusConflict = errors.New("record status changed concurrently")
	// ErrDomainInUse is returned when another tenant's unverified domain row cannot be released because a
	// live (active) domain still depends on it (an active alias redirecting to it).
	ErrDomainInUse = errors.New("domain still used by another tenant")
)

// IsDuplicateKey reports a MySQL unique-key violation (error 1062), e.g. two requests racing to create
// the same slug or email, so callers can answer with a friendly conflict instead of the raw database text.
func IsDuplicateKey(err error) bool {
	return errors.Is(err, ErrDuplicate) || isDuplicateKey(err)
}
