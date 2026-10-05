package service

import "errors"

// Payout request errors. Their messages are written for the agent/admin and are safe to return to the
// client; anything else coming out of the payout flow (database, driver) is answered with a generic 500.
var (
	// ErrPayoutInvalid groups validation and business-rule failures (HTTP 400).
	ErrPayoutInvalid = errors.New("pengajuan penarikan tidak valid")
	// ErrPayoutStatusConflict: the request is not in the status the action needs (HTTP 409).
	ErrPayoutStatusConflict = errors.New("status pengajuan penarikan tidak sesuai")

	ErrPayoutBankInfoRequired     = payoutInvalid("nama bank, nomor rekening, dan nama pemilik rekening wajib diisi")
	ErrPayoutAmountNotPositive    = payoutInvalid("jumlah penarikan harus lebih besar dari 0")
	ErrPayoutActiveRequestExists  = payoutInvalid("Anda masih punya pengajuan yang sedang diproses")
	ErrPayoutExceedsBalance       = payoutInvalid("jumlah penarikan melebihi saldo siap cair yang tersedia")
	ErrPayoutRejectReasonRequired = payoutInvalid("alasan penolakan wajib diisi")
)

// payoutError carries a client-facing message and matches its category sentinel with errors.Is.
type payoutError struct {
	msg  string
	kind error
}

func (e *payoutError) Error() string        { return e.msg }
func (e *payoutError) Is(target error) bool { return target == e.kind }

func payoutInvalid(msg string) error { return &payoutError{msg: msg, kind: ErrPayoutInvalid} }

func payoutStatusConflict(msg string) error {
	return &payoutError{msg: msg, kind: ErrPayoutStatusConflict}
}
