package service

import (
	"context"
	"testing"
	"time"

	"klikumroh/internal/repository"
)

// Business days are WIB whatever time zone the server process runs in. These tests force the process
// zone to UTC (a typical VPS) so a regression back to time.Local / now.Location() fails here, not only in
// production (a Windows dev box already runs on WIB and hides it).
func withProcessZone(t *testing.T, loc *time.Location) {
	t.Helper()
	prev := time.Local
	time.Local = loc
	t.Cleanup(func() { time.Local = prev })
}

func TestCouponEndOfDay_IsWIBOnUTCServer(t *testing.T) {
	withProcessZone(t, time.UTC)

	// expires_at is a DATE scanned as midnight WIB (DSN loc=Asia/Jakarta).
	expires := time.Date(2026, time.October, 31, 0, 0, 0, 0, jakartaLocation)
	end := couponEndOfDay(expires)

	want := time.Date(2026, time.October, 31, 23, 59, 59, 0, jakartaLocation)
	if !end.Equal(want) {
		t.Fatalf("couponEndOfDay = %v, want %v", end, want)
	}

	lastValid := time.Date(2026, time.October, 31, 16, 59, 0, 0, time.UTC) // 23:59 WIB on 31 Oct
	firstInvalid := time.Date(2026, time.October, 31, 17, 0, 0, 0, time.UTC) // 00:00 WIB on 1 Nov
	if lastValid.After(end) {
		t.Fatal("31 Oct 23:59 WIB must still be within the coupon's last day")
	}
	if !firstInvalid.After(end) {
		t.Fatal("1 Nov 00:00 WIB must be past the coupon's last day (UTC server used to allow until 06:59 WIB)")
	}

	// The same calendar date scanned in another zone still ends at 23:59:59 WIB of that WIB date.
	if got := couponEndOfDay(expires.UTC()); !got.Equal(want) {
		t.Fatalf("couponEndOfDay(UTC instant) = %v, want %v", got, want)
	}
}

type fakeOverviewRepo struct{ raw *repository.DashboardOverviewRawData }

func (f fakeOverviewRepo) GetOverview(ctx context.Context, tenantID uint64) (*repository.DashboardOverviewRawData, error) {
	return f.raw, nil
}

// The SQL buckets the series by WIB date (DATE_FORMAT/CURDATE in the +07:00 session); the Go side must
// generate the same WIB day keys, or today's rows are dropped. Run under UTC-12 and UTC+14: whatever the
// real time of day, at least one of them is on a different calendar date than WIB, so a regression back
// to time.Now() in the process zone fails this test at any hour.
func TestDashboardOverview_SeriesEndsOnWIBToday(t *testing.T) {
	for _, zone := range []*time.Location{time.FixedZone("UTC-12", -12*3600), time.FixedZone("UTC+14", 14*3600)} {
		t.Run(zone.String(), func(t *testing.T) {
			withProcessZone(t, zone)
			today := time.Now().In(jakartaLocation).Format("2006-01-02")

			svc := NewDashboardOverviewService(fakeOverviewRepo{raw: &repository.DashboardOverviewRawData{
				ProspectTrends: []repository.ProspectTrendRaw{{DateStr: today, Channel: "agent", Count: 3}},
				KPIDaily:       []repository.KPIDayRaw{{DateStr: today, Prospects: 3, Closings: 1}},
			}})
			res, err := svc.GetOverview(context.Background(), 1)
			if err != nil {
				t.Fatalf("GetOverview: %v", err)
			}

			lastTrend := res.ProspectTrends[len(res.ProspectTrends)-1]
			if lastTrend.Date != today || lastTrend.Agent != 3 {
				t.Fatalf("prospect_trends ends at %s with agent=%d, want %s with 3 (today's rows dropped)", lastTrend.Date, lastTrend.Agent, today)
			}
			lastKPI := res.KPIDaily[len(res.KPIDaily)-1]
			if lastKPI.Date != today || lastKPI.Prospects != 3 || lastKPI.Closings != 1 {
				t.Fatalf("kpi_daily ends at %+v, want %s with prospects=3 closings=1", lastKPI, today)
			}
		})
	}
}
