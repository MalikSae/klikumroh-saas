package handler

import (
	"errors"

	"klikumroh/internal/service"
)

// isProspectInputError reports whether err is a prospect validation error that should be shown to the
// user as 400 Bad Request (never a 500).
func isProspectInputError(err error) bool {
	for _, target := range []error{
		service.ErrProspectNameRequired,
		service.ErrInvalidProspectName,
		service.ErrProspectPhoneRequired,
		service.ErrInvalidProspectPhone,
		service.ErrInvalidProspectEmail,
		service.ErrInvalidJumlahJamaah,
		service.ErrJumlahJamaahTooLarge,
		service.ErrLostReasonTooLong,
		service.ErrNoteTooLong,
		service.ErrPackageNotFound,
		service.ErrInvalidProspectStatus,
		service.ErrProspectAlreadyClosed,
		service.ErrCorrectionReasonRequired,
		service.ErrCancelReasonRequired,
		service.ErrInvalidReleasePolicy,
		service.ErrLostReasonCategoryInvalid,
		service.ErrLostReasonDetailRequired,
		service.ErrConsentRequired,
		service.ErrAgentConsentRequired,
		service.ErrInvalidDeparturePlan,
		service.ErrInvalidDomicile,
		service.ErrPipelineDetailsRequired,
		service.ErrPipelineDetailsClear,
		service.ErrPackageNotOnSale,
	} {
		if errors.Is(err, target) {
			return true
		}
	}
	return false
}

// isProspectConflictError reports errors caused by the prospect's current state (409 Conflict).
func isProspectConflictError(err error) bool {
	return errors.Is(err, service.ErrProspectStatusConflict) ||
		errors.Is(err, service.ErrProspectCannotDelete) ||
		errors.Is(err, service.ErrProspectAlreadyInYourList) ||
		errors.Is(err, service.ErrProspectOwnedByOther) ||
		errors.Is(err, service.ErrProspectNotClosing) ||
		errors.Is(err, service.ErrProspectAlreadyPaidOff) ||
		errors.Is(err, service.ErrPhoneUsedByOpenProspect) ||
		errors.Is(err, service.ErrProspectAnonymized) ||
		errors.Is(err, service.ErrLostReasonSystemCategory)
}
