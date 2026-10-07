package service

// PlaybookMinPlanMonths is the shortest plan period that includes the recruitment guide.
const PlaybookMinPlanMonths = 12

// CanAccessPlaybook decides whether a travel may read the recruitment guide (keputusan pendiri 7 Okt 2026):
// an active subscription on a plan of 12 months or more. Once the subscription has expired the guide closes
// at once, without the 7-day grace period. The demo travel may always read it, as a sample. The rule reads
// the plan period, not a plan ID, so a renamed or replaced 12-month plan keeps working.
func CanAccessPlaybook(info *TenantSubscriptionInfo) bool {
	if info == nil {
		return false
	}
	if info.IsDemo {
		return true
	}
	if !info.IsActive || info.CurrentPlanPeriod == nil {
		return false
	}
	return *info.CurrentPlanPeriod >= PlaybookMinPlanMonths
}
