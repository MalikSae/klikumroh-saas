package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/google/uuid"

	"klikumroh/internal/repository"
	"klikumroh/internal/util"
)

// Jamaah payment proofs sent by the agent (founder decision 7 Oct 2026). Flow 1: the agent uploads the
// transfer proof (DP for closing, or pelunasan) and the travel admin approves or rejects it; approval does
// exactly what the admin's own Closing / Tandai lunas does. Flow 2 stays: the admin closes or marks paid off
// directly (jamaah at the office), which also settles a request still waiting.

var (
	ErrPaymentRequestKind       = errors.New("jenis pengajuan tidak valid, gunakan 'closing' atau 'paid_off'")
	ErrPaymentProofRequired     = errors.New("foto bukti transfer wajib diunggah")
	ErrPaymentRequestPending    = errors.New("pengajuan sebelumnya masih menunggu verifikasi admin travel")
	ErrPaymentRequestClosingNA  = errors.New("pengajuan closing tidak bisa untuk jamaah yang sudah Closing atau Tidak Lanjut")
	ErrPaymentRequestPaidOffNA  = errors.New("bukti pelunasan hanya untuk jamaah Closing yang belum lunas")
	ErrPaymentRequestDecided    = errors.New("pengajuan ini sudah diproses")
	ErrPaymentRejectReason      = errors.New("alasan penolakan wajib diisi (maksimal 255 karakter)")
	ErrPaymentRequestNoteLong   = errors.New("catatan maksimal 500 karakter")
	ErrPaymentRequestAmount     = errors.New("nominal tidak valid")
	ErrPaymentRequestNotEnabled = errors.New("fitur pengajuan bukti belum aktif")
)

// PaymentRequestInput is what the agent sends with the proof.
type PaymentRequestInput struct {
	Kind       string
	ProofBytes []byte
	Amount     *float64
	Note       *string
	// Package and jamaah count for a closing request when the jamaah has none yet.
	Details StatusDetails
}

func (s *prospectService) SetPaymentRequestRepo(repo repository.PaymentRequestRepository) {
	s.paymentRepo = repo
}

func (s *prospectService) paymentRequestsOf(ctx context.Context, tenantID, prospectID uint64) []repository.PaymentRequest {
	if s.paymentRepo == nil {
		return []repository.PaymentRequest{}
	}
	list, err := s.paymentRepo.ListByProspect(ctx, tenantID, prospectID)
	if err != nil {
		log.Printf("[PaymentRequest] list for prospect %d: %v", prospectID, err)
		return []repository.PaymentRequest{}
	}
	return list
}

// settlePaymentRequests closes the requests still waiting when the admin acted on the prospect directly.
func (s *prospectService) settlePaymentRequests(ctx context.Context, tenantID, prospectID uint64, kind, status string, adminUserID uint64) {
	if s.paymentRepo == nil {
		return
	}
	if err := s.paymentRepo.ResolvePending(ctx, tenantID, prospectID, kind, status, adminUserID); err != nil {
		log.Printf("[PaymentRequest] settle %s for prospect %d: %v", kind, prospectID, err)
	}
}

func paymentKindLabel(kind string) string {
	if kind == repository.PaymentRequestPaidOff {
		return "bukti pelunasan"
	}
	return "bukti DP (closing)"
}

func (s *prospectService) SubmitPaymentRequestByAgent(ctx context.Context, tenantID, agentID, prospectID uint64, input PaymentRequestInput) (*repository.PaymentRequest, error) {
	if s.paymentRepo == nil {
		return nil, ErrPaymentRequestNotEnabled
	}
	if err := s.verifyActiveAgent(ctx, tenantID, agentID); err != nil {
		return nil, err
	}
	kind := strings.TrimSpace(input.Kind)
	if kind != repository.PaymentRequestClosing && kind != repository.PaymentRequestPaidOff {
		return nil, ErrPaymentRequestKind
	}
	if len(input.ProofBytes) == 0 {
		return nil, ErrPaymentProofRequired
	}
	if input.Amount != nil && (*input.Amount < 0 || *input.Amount > 1e12) {
		return nil, ErrPaymentRequestAmount
	}
	note := trimmedPtr(input.Note)
	if note != nil && len([]rune(*note)) > 500 {
		return nil, ErrPaymentRequestNoteLong
	}

	prospect, err := s.prospectRepo.GetByID(ctx, tenantID, prospectID)
	if err != nil {
		return nil, err
	}
	// Only the agent's own jamaah; another agent's (or another travel's) is simply not found.
	if prospect.AgentID == nil || *prospect.AgentID != agentID {
		return nil, repository.ErrNotFound
	}
	if prospect.AnonymizedAt != nil {
		return nil, ErrProspectAnonymized
	}
	switch kind {
	case repository.PaymentRequestClosing:
		if prospect.Status == "closing" || prospect.Status == "tidak_lanjut" {
			return nil, ErrPaymentRequestClosingNA
		}
	case repository.PaymentRequestPaidOff:
		if prospect.Status != "closing" || prospect.PaidOffAt != nil {
			return nil, ErrPaymentRequestPaidOffNA
		}
	}
	if _, err := s.paymentRepo.FindPending(ctx, tenantID, prospectID, kind); err == nil {
		return nil, ErrPaymentRequestPending
	} else if !errors.Is(err, repository.ErrNotFound) {
		return nil, err
	}
	// A closing needs a package and a jamaah count (same rule as the admin's Closing).
	if kind == repository.PaymentRequestClosing {
		if err := s.fillPipelineDetails(ctx, tenantID, prospect, "closing", []StatusDetails{input.Details}); err != nil {
			return nil, err
		}
	}

	relPath := fmt.Sprintf("/uploads/%d/agents/%d/prospect-proofs/%s.webp", tenantID, agentID, uuid.New().String())
	absPath := util.PrivateUploadAbsPath(relPath) // private: served by /api/dashboard/files and /api/agent/files
	if err := util.ConvertAndSaveWebP(input.ProofBytes, absPath, 1600, 80); err != nil {
		return nil, err
	}
	req := &repository.PaymentRequest{ProspectID: prospectID, AgentID: agentID, Kind: kind, ProofURL: relPath, Amount: input.Amount, Note: note}
	if err := s.paymentRepo.Create(ctx, tenantID, req); err != nil {
		_ = os.Remove(absPath)
		return nil, err
	}

	agentName := "Agen"
	if a, err := s.agentRepo.GetByID(ctx, tenantID, agentID); err == nil {
		agentName = a.Name
	}
	title := "Bukti DP dari agen"
	if kind == repository.PaymentRequestPaidOff {
		title = "Bukti pelunasan dari agen"
	}
	s.notifyActiveAdmins(ctx, tenantID, "payment_request", title,
		fmt.Sprintf("%s mengirim %s untuk %s. Periksa lalu setujui atau tolak.", agentName, paymentKindLabel(kind), prospect.Name),
		fmt.Sprintf("/prospects/%d", prospectID))
	return req, nil
}

func (s *prospectService) ListPendingPaymentRequests(ctx context.Context, tenantID uint64) ([]repository.PaymentRequest, error) {
	if s.paymentRepo == nil {
		return []repository.PaymentRequest{}, nil
	}
	return s.paymentRepo.ListPending(ctx, tenantID)
}

// ApprovePaymentRequest does what the admin's own action does (Closing with commission, or Tandai lunas
// with the commission release); that action settles the request as approved.
func (s *prospectService) ApprovePaymentRequest(ctx context.Context, tenantID, adminUserID, id uint64) error {
	if s.paymentRepo == nil {
		return ErrPaymentRequestNotEnabled
	}
	req, err := s.paymentRepo.GetByID(ctx, tenantID, id)
	if err != nil {
		return err
	}
	if req.Status != "pending" {
		return ErrPaymentRequestDecided
	}
	switch req.Kind {
	case repository.PaymentRequestClosing:
		if err := s.UpdateStatus(ctx, tenantID, req.ProspectID, adminUserID, "closing", nil, nil); err != nil {
			return err
		}
	case repository.PaymentRequestPaidOff:
		if err := s.MarkPaidOff(ctx, tenantID, req.ProspectID, adminUserID); err != nil && !errors.Is(err, ErrProspectAlreadyPaidOff) {
			return err
		}
		// Already paid off without a release to do: still settle this request.
		s.settlePaymentRequests(ctx, tenantID, req.ProspectID, repository.PaymentRequestPaidOff, "approved", adminUserID)
	}
	return nil
}

func (s *prospectService) RejectPaymentRequest(ctx context.Context, tenantID, adminUserID, id uint64, reason string) error {
	if s.paymentRepo == nil {
		return ErrPaymentRequestNotEnabled
	}
	reason = strings.TrimSpace(reason)
	if reason == "" || len([]rune(reason)) > 255 {
		return ErrPaymentRejectReason
	}
	req, err := s.paymentRepo.GetByID(ctx, tenantID, id)
	if err != nil {
		return err
	}
	if err := s.paymentRepo.Decide(ctx, tenantID, id, "rejected", &reason, adminUserID); err != nil {
		if errors.Is(err, repository.ErrPaymentRequestNotPending) {
			return ErrPaymentRequestDecided
		}
		return err
	}
	name := "jamaah"
	if p, err := s.prospectRepo.GetByID(ctx, tenantID, req.ProspectID); err == nil {
		name = p.Name
	}
	s.notifyAgent(ctx, tenantID, req.AgentID, "payment_request_rejected", "Bukti pembayaran ditolak",
		fmt.Sprintf("%s untuk %s ditolak: %s. Kirim ulang bukti yang benar.", strings.ToUpper(paymentKindLabel(req.Kind)[:1])+paymentKindLabel(req.Kind)[1:], name, reason),
		fmt.Sprintf("/agen/jamaah/%d", req.ProspectID))
	return nil
}
