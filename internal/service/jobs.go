package service

import (
	"context"
	"log"
	"runtime/debug"
	"time"
)

// RunJobSafely runs one iteration of a background job and recovers from a panic in it: the panic and its
// stack are logged and the job's loop keeps running at its next interval. Without this, a panic in any
// background goroutine would kill the whole API process (every tenant), since net/http's recovery only
// covers request handlers.
func RunJobSafely(name string, run func()) {
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("[Job %s] panic recovered: %v\n%s", name, rec, debug.Stack())
		}
	}()
	run()
}

// StartDailyDomainRecheck runs the custom-domain DNS recheck firstDelay after start, then every interval.
// RecheckActiveDomains counts at most one check per domain per ~day (daily_check_at), so frequent restarts
// never speed up the "3 failed days in a row" rule.
func StartDailyDomainRecheck(ctx context.Context, domains DomainService, firstDelay, interval time.Duration) {
	go func() {
		timer := time.NewTimer(firstDelay)
		defer timer.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-timer.C:
				RunJobSafely("domain-recheck", func() {
					checked, failing := domains.RecheckActiveDomains(ctx)
					log.Printf("[Domain] daily recheck: %d active custom domains checked, %d failing", checked, failing)
				})
				timer.Reset(interval)
			}
		}
	}()
}
