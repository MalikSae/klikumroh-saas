package repository

import (
	"fmt"
	"net/url"

	// Embed the IANA timezone database so Asia/Jakarta resolves on any host (pure Go, no system tzdata needed).
	_ "time/tzdata"
)

// BusinessTimeZone is the single platform timezone (WIB). Both MySQL session time_zone and the Go driver
// location use it, so CURRENT_TIMESTAMP/NOW() defaults and timestamps written from Go describe the same
// instant, and DATE()/CURDATE() based reports follow Indonesian business days regardless of server timezone.
const BusinessTimeZone = "Asia/Jakarta"

// businessTimeZoneOffset is the fixed MySQL session offset for BusinessTimeZone (WIB has no DST).
const businessTimeZoneOffset = "+07:00"

// MySQLDSN builds the DSN used by every entrypoint and DB-backed test. extraParams (e.g.
// "multiStatements=true") are appended as-is.
func MySQLDSN(user, password, host, port, dbName string, extraParams ...string) string {
	params := url.Values{}
	params.Set("parseTime", "true")
	params.Set("loc", BusinessTimeZone)
	params.Set("time_zone", "'"+businessTimeZoneOffset+"'")

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?%s", user, password, host, port, dbName, params.Encode())
	for _, p := range extraParams {
		dsn += "&" + p
	}
	return dsn
}
