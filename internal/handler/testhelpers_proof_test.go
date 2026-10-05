package handler_test

// testProofURL is a transfer proof path for invoices that tests approve: approval of an invoice above
// Rp 0 requires a proof (ErrProofRequired).
func testProofURL() *string {
	p := "/uploads/test/subscription-proofs/proof.webp"
	return &p
}
