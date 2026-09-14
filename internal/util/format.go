package util

import (
	"fmt"
	"strings"
)

// FormatRupiah formats a float64 into Indonesian Rupiah format without currency prefix, e.g. 1.500.000
func FormatRupiah(amount float64) string {
	intVal := int64(amount)
	sign := ""
	if intVal < 0 {
		sign = "-"
		intVal = -intVal
	}
	str := fmt.Sprintf("%d", intVal)
	var parts []string
	for len(str) > 3 {
		parts = append([]string{str[len(str)-3:]}, parts...)
		str = str[:len(str)-3]
	}
	if len(str) > 0 {
		parts = append([]string{str}, parts...)
	}
	return sign + strings.Join(parts, ".")
}
