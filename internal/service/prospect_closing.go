package service

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"
	"unicode/utf8"

	"klikumroh/internal/repository"
	"klikumroh/internal/util"
)

// Closing = jamaah sudah membayar DP. The agent's commission is booked at closing but stays on hold
// ("tertahan") until the admin marks the jamaah as paid off ("Tandai Lunas"), unless the travel chose
// to release commission at DP. A cancelled closing reverses the commission with correction entries;
// if part of it was already withdrawable, the negative entry offsets the agent's next commissions.
// KlikUmroh does not record payment amounts (not an ERP) — only these two moments.

const maxCancelReasonLength = 200

func (s *prospectService) SetCommissionPolicyRepo(repo repository.CommissionPolicyRepository) {
	s.policyRepo = repo
}

// releaseOn returns the tenant's release policy. Without a policy repository (older wiring/tests)
// commission is released immediately, which is the historical behaviour.
func (s *prospectService) releaseOn(ctx context.Context, tenantID uint64) string {
	if s.policyRepo == nil {
		return repository.CommissionReleaseOnDP
	}
	v, err := s.policyRepo.GetReleaseOn(ctx, tenantID)
	if err != nil || v == "" {
		return repository.CommissionReleaseOnLunas
	}
	return v
}

// releaseTimeFor decides whether a new ledger entry for this prospect is withdrawable right away.
func (s *prospectService) releaseTimeFor(ctx context.Context, tenantID uint64, prospect *repository.Prospect) *time.Time {
	if prospect.PaidOffAt != nil || s.releaseOn(ctx, tenantID) == repository.CommissionReleaseOnDP {
		now := time.Now()
		return &now
	}
	return nil
}

func (s *prospectService) GetCommissionReleaseOn(ctx context.Context, tenantID uint64) (string, error) {
	return s.releaseOn(ctx, tenantID), nil
}

func (s *prospectService) SetCommissionReleaseOn(ctx context.Context, tenantID uint64, releaseOn string) error {
	v := strings.ToLower(strings.TrimSpace(releaseOn))
	if v != repository.CommissionReleaseOnLunas && v != repository.CommissionReleaseOnDP {
		return ErrInvalidReleasePolicy
	}
	if s.policyRepo == nil {
		return errors.New("commission policy repository not configured")
	}
	return s.policyRepo.SetReleaseOn(ctx, tenantID, v)
}

// MarkPaidOff records that the jamaah has paid in full and releases the held commission.
func (s *prospectService) MarkPaidOff(ctx context.Context, tenantID uint64, id uint64, adminUserID uint64) error {
	prospect, err := s.prospectRepo.GetByID(ctx, tenantID, id)
	if err != nil {
		return err
	}
	if prospect.Status != "closing" {
		return ErrProspectNotClosing
	}
	// The lunas mark and the commission release are two separate writes. When an earlier attempt set
	// paid_off_at but failed to release, a retry must still release the held commission instead of
	// stopping at "already paid off" (which would leave it held forever).
	alreadyPaidOff := prospect.PaidOffAt != nil
	if !alreadyPaidOff {
		if err := s.prospectRepo.MarkPaidOff(ctx, tenantID, id); err != nil {
			if !errors.Is(err, repository.ErrStatusConflict) {
				return err
			}
			alreadyPaidOff = true
		}
	}

	var released int64
	if s.commissionLedgerRepo != nil {
		if released, err = s.commissionLedgerRepo.ReleaseByProspect(ctx, tenantID, id); err != nil {
			return err
		}
	}
	if alreadyPaidOff && released == 0 {
		return ErrProspectAlreadyPaidOff
	}

	s.addSystemNote(ctx, tenantID, id, "Jamaah ditandai lunas oleh admin. Komisi agen dapat dicairkan.")
	s.settlePaymentRequests(ctx, tenantID, id, repository.PaymentRequestPaidOff, "approved", adminUserID)
	if prospect.AgentID != nil && released > 0 {
		s.notifyAgent(ctx, tenantID, *prospect.AgentID, "commission_released", "Komisi siap dicairkan",
			fmt.Sprintf("Jamaah %s sudah lunas. Komisi Anda sekarang bisa dicairkan.", prospect.Name),
			"/agen/riwayat-komisi")
	}
	return nil
}

// CancelClosing handles a jamaah who cancels after DP: the prospect goes to 'Tidak Lanjut' with the
// reason, and every commission booked for it is reversed with correction entries (the originals stay
// for the audit trail). Held commission is reversed as held; already-withdrawable commission is
// reversed as withdrawable, so it is deducted from the agent's next commissions.
func (s *prospectService) CancelClosing(ctx context.Context, tenantID uint64, id uint64, adminUserID uint64, reason string) (*CancelClosingResult, error) {
	reason = strings.Join(strings.Fields(reason), " ")
	if reason == "" || utf8.RuneCountInString(reason) > maxCancelReasonLength {
		return nil, ErrCancelReasonRequired
	}

	prospect, err := s.prospectRepo.GetByID(ctx, tenantID, id)
	if err != nil {
		return nil, err
	}
	if prospect.Status != "closing" {
		return nil, ErrProspectNotClosing
	}

	lostReason := "Batal setelah DP: " + reason
	lostReasonPtr := &lostReason
	// The jamaah's personal data was removed (UU PDP). The closing can still be cancelled so the
	// commission is reversed, but the admin's free-text reason (which often names the jamaah) is not
	// stored anywhere: lost_reason stays empty and the ledger, note and notification use a fixed text.
	if prospect.AnonymizedAt != nil {
		reason = repository.AnonymizedLedgerNote
		lostReasonPtr = nil
	}
	category := "batal_setelah_dp"
	if err := s.prospectRepo.TransitionStatus(ctx, tenantID, id, "closing", "tidak_lanjut", lostReasonPtr, &category); err != nil {
		if errors.Is(err, repository.ErrStatusConflict) {
			return nil, ErrProspectStatusConflict
		}
		return nil, err
	}

	result := &CancelClosingResult{}
	// Per agent: what that agent loses, so each one is told only its own amounts.
	type reversal struct {
		held, released float64
		override       bool
	}
	reversals := map[uint64]reversal{}
	var reversalOrder []uint64
	if s.commissionLedgerRepo != nil {
		ledgers, err := s.commissionLedgerRepo.ListByProspect(ctx, tenantID, id)
		if err != nil {
			return nil, s.revertCancel(ctx, tenantID, id, prospect.PaidOffAt != nil, err)
		}
		type balance struct {
			held, released float64
			override       bool // the agent's rows include an upline override
		}
		perAgent := map[uint64]*balance{}
		var order []uint64
		var pkgID *uint64
		for _, l := range ledgers {
			b, ok := perAgent[l.AgentID]
			if !ok {
				b = &balance{}
				perAgent[l.AgentID] = b
				order = append(order, l.AgentID)
			}
			if l.Type == "override" {
				b.override = true
			}
			if l.ReleasedAt == nil {
				b.held += l.Amount
			} else {
				b.released += l.Amount
			}
			if pkgID == nil && l.PackageID != nil {
				pkgID = l.PackageID
			}
		}
		note := cancelClosingNotePrefix + reason
		now := time.Now()
		var entries []*repository.CommissionLedger
		for _, agentID := range order {
			b := perAgent[agentID]
			if math.Round(b.held*100) != 0 || math.Round(b.released*100) != 0 {
				reversals[agentID] = reversal{held: b.held, released: b.released, override: b.override}
				reversalOrder = append(reversalOrder, agentID)
			}
			if math.Round(b.held*100) != 0 {
				entries = append(entries, &repository.CommissionLedger{
					TenantID: tenantID, AgentID: agentID, ProspectID: id, PackageID: pkgID,
					Type: "correction", Amount: -b.held, Notes: &note,
				})
				result.ReversedHeld += b.held
			}
			if math.Round(b.released*100) != 0 {
				entries = append(entries, &repository.CommissionLedger{
					TenantID: tenantID, AgentID: agentID, ProspectID: id, PackageID: pkgID,
					Type: "correction", Amount: -b.released, Notes: &note, ReleasedAt: &now,
				})
				result.ReversedReleased += b.released
			}
		}
		if err := s.createLedgers(ctx, tenantID, entries); err != nil {
			return nil, s.revertCancel(ctx, tenantID, id, prospect.PaidOffAt != nil, err)
		}
	}

	s.recordHistory(ctx, tenantID, id, "admin", adminUserID, "closing", "tidak_lanjut")
	s.addSystemNote(ctx, tenantID, id, "Closing dibatalkan: "+reason)

	if prospect.AgentID != nil {
		body := fmt.Sprintf("Closing calon jamaah %s dibatalkan (%s).", prospect.Name, reason)
		// Only the agent's own released commission: never the upline's override, which is told separately.
		if own := reversals[*prospect.AgentID]; math.Round(own.released*100) > 0 {
			body += fmt.Sprintf(" Komisi Rp %s yang sudah bisa dicairkan akan dipotong dari komisi berikutnya.", util.FormatRupiah(own.released))
		}
		s.notifyAgent(ctx, tenantID, *prospect.AgentID, "prospect_closing_cancelled", "Closing dibatalkan", body,
			fmt.Sprintf("/agen/jamaah/%d", prospect.ID))
	}
	// The other agents with commission on this closing (the upline's override): a generic notice without
	// the jamaah's identity, which belongs to the downline's prospect.
	for _, agentID := range reversalOrder {
		if prospect.AgentID != nil && agentID == *prospect.AgentID {
			continue
		}
		r := reversals[agentID]
		total := r.held + r.released
		if math.Round(total*100) <= 0 {
			continue
		}
		body := fmt.Sprintf("Sebuah closing agen binaan Anda dibatalkan. Komisi Pembinaan Rp %s dari closing itu ditarik kembali.", util.FormatRupiah(total))
		title := "Komisi Pembinaan dibatalkan"
		if !r.override {
			body = fmt.Sprintf("Sebuah closing dibatalkan. Komisi Rp %s dari closing itu ditarik kembali.", util.FormatRupiah(total))
			title = "Komisi dibatalkan"
		}
		if math.Round(r.released*100) > 0 {
			body += fmt.Sprintf(" Rp %s yang sudah bisa dicairkan akan dipotong dari komisi berikutnya.", util.FormatRupiah(r.released))
		}
		s.notifyAgent(ctx, tenantID, agentID, "commission_override_reversed", title, body, "/agen/riwayat-komisi")
	}
	// The closing is gone: a pelunasan proof still waiting no longer applies.
	s.settlePaymentRequests(ctx, tenantID, id, repository.PaymentRequestPaidOff, "cancelled", adminUserID)
	return result, nil
}

// revertCancel gives the closing back when the commission reversal could not be written, so the
// admin can retry without leaving an unreversed commission behind.
func (s *prospectService) revertCancel(ctx context.Context, tenantID, id uint64, wasPaidOff bool, cause error) error {
	if err := s.prospectRepo.TransitionStatus(ctx, tenantID, id, "tidak_lanjut", "closing", nil, nil); err != nil {
		return fmt.Errorf("%w (and failed to restore closing: %v)", cause, err)
	}
	// Leaving closing cleared the "lunas" mark; put it back so the restored closing is unchanged.
	if wasPaidOff {
		if err := s.prospectRepo.MarkPaidOff(ctx, tenantID, id); err != nil {
			return fmt.Errorf("%w (and failed to restore lunas: %v)", cause, err)
		}
	}
	return cause
}
