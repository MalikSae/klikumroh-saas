package main

import (
	"fmt"
	"time"
)

// targets adds agent targets (Program agen > Target & reward, 6 Oct 2026): two running this month, so the
// progress bars fill from the demo closings and recruits, and one closed last month with winners (one
// reward handed over, one still to hand over).
func (s *seeder) targets() error {
	var adminID uint64
	if err := s.tx.QueryRowContext(s.ctx, "SELECT id FROM admin_users WHERE tenant_id = ? ORDER BY id LIMIT 1", s.tenantID).Scan(&adminID); err != nil {
		return fmt.Errorf("demo admin: %w", err)
	}

	now := time.Now().In(wib)
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, wib)
	monthEnd := monthStart.AddDate(0, 1, -1)
	lastStart := monthStart.AddDate(0, -1, 0)
	lastEnd := monthStart.AddDate(0, 0, -1)
	day := func(t time.Time) string { return t.Format("2006-01-02") }
	months := []string{"", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"}

	insert := func(title, metric string, value int, reward string, start, end time.Time, status string) (uint64, error) {
		return s.exec(`INSERT INTO agent_targets (tenant_id, title, metric_type, metric_value, reward_description, period_start, period_end, status, created_by, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			s.tenantID, title, metric, value, reward, day(start), day(end), status, adminID, start.Add(9*time.Hour))
	}

	if _, err := insert("Closing "+months[now.Month()], "closing_pax", 10, "Bonus tunai Rp 2.000.000", monthStart, monthEnd, "active"); err != nil {
		return err
	}
	if _, err := insert("Ajak mitra baru", "mitra_baru_count", 3, "Voucher potongan umroh Rp 1.500.000", monthStart, monthEnd, "active"); err != nil {
		return err
	}
	closedID, err := insert("Closing "+months[lastStart.Month()], "closing_pax", 5, "Bonus tunai Rp 1.000.000", lastStart, lastEnd, "closed")
	if err != nil {
		return err
	}

	// Winners of last month: the first active agents (the demo login first). One reward handed over.
	rows, err := s.tx.QueryContext(s.ctx, "SELECT id FROM agents WHERE tenant_id = ? AND status = 'active' ORDER BY id LIMIT 2", s.tenantID)
	if err != nil {
		return err
	}
	var winners []uint64
	for rows.Next() {
		var id uint64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		winners = append(winners, id)
	}
	rows.Close()
	achievedAt := monthStart.Add(10 * time.Hour)
	for i, agentID := range winners {
		status, givenAt, givenBy := "pending", interface{}(nil), interface{}(nil)
		if i == 0 {
			status, givenAt, givenBy = "given", monthStart.AddDate(0, 0, 2).Add(14*time.Hour), adminID
		}
		if _, err := s.exec(`INSERT INTO agent_target_achievements (tenant_id, target_id, agent_id, achieved_value, achieved_at, reward_status,
				reward_given_at, reward_given_by, reward_description_snapshot)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			s.tenantID, closedID, agentID, 7-i, achievedAt, status, givenAt, givenBy, "Bonus tunai Rp 1.000.000"); err != nil {
			return err
		}
	}
	return nil
}
