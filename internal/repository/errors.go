package repository

import "errors"

var (
	// ErrNotFound is returned when a requested record is not found or does not belong to the specified tenant.
	ErrNotFound = errors.New("record not found")
	// ErrDuplicate is returned when a unique constraint is violated.
	ErrDuplicate = errors.New("duplicate entry")
	// ErrForeignKeyViolation is returned when an operation violates a foreign key constraint.
	ErrForeignKeyViolation = errors.New("foreign key constraint violation")
)
