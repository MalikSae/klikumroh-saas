package middleware

import (
	"net/url"
	"strings"
)

// redactedAccessLogParams are query parameters whose values can hold a jamaah's personal data (a name or
// WhatsApp number typed into a search box). Their values are never written to access_logs: anonymizing or
// deleting a prospect (UU PDP) does not touch the audit trail, so the data would otherwise stay there for
// good. The parameter name stays, so the log still shows that a search was made.
var redactedAccessLogParams = map[string]bool{
	"search":   true,
	"q":        true,
	"query":    true,
	"keyword":  true,
	"phone":    true,
	"whatsapp": true,
	"name":     true,
	"email":    true,
}

// redactAccessLogQuery returns rawQuery with the values of redactedAccessLogParams replaced by
// "[REDACTED]". Other parameters (e.g. the private file path of /files, status or page filters) and the
// parameter order are kept as sent.
func redactAccessLogQuery(rawQuery string) string {
	if rawQuery == "" {
		return ""
	}
	parts := strings.Split(rawQuery, "&")
	for i, part := range parts {
		name, value, hasValue := strings.Cut(part, "=")
		if !hasValue || value == "" {
			continue
		}
		decoded, err := url.QueryUnescape(name)
		if err != nil {
			decoded = name
		}
		if redactedAccessLogParams[strings.ToLower(strings.TrimSpace(decoded))] {
			parts[i] = name + "=[REDACTED]"
		}
	}
	return strings.Join(parts, "&")
}
