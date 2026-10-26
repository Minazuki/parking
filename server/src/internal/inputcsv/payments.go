package inputcsv

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sort"
	"strings"
	"time"

	"github.com/Minazuki/parking/server/src/internal/domain"
)

var paymentHeaders = []string{"棟別", "戶號", "機車位已繳費", "腳踏車（大）已繳費", "腳踏車（小）已繳費"}

func ParsePayments(raw []byte, first domain.First, importedAt time.Time) (domain.Payments, error) {
	result := domain.Payments{SchemaVersion: 1, Payments: []domain.Payment{}}
	table, err := readTable(Payments, raw, 5, paymentHeaders)
	if err != nil {
		return result, err
	}
	buildings := map[string]string{}
	for _, r := range first.Registrations.A {
		buildings[r.Household] = "A"
	}
	for _, r := range first.Registrations.B {
		buildings[r.Household] = "B"
	}
	seen := map[string]bool{}
	for _, row := range table.rows {
		if empty(row.values) {
			continue
		}
		id, err := household(row.values[1])
		if err != nil {
			return result, issue(Payments, row.line, "戶號", err.Error())
		}
		expected, ok := buildings[id]
		if !ok {
			return result, issue(Payments, row.line, "戶號", "不屬於0/保存的登記名單")
		}
		building := strings.TrimSuffix(strings.ToUpper(row.values[0]), "棟")
		if building != expected {
			return result, issue(Payments, row.line, "棟別", "棟別與0/保存的登記不符")
		}
		if seen[id] {
			return result, issue(Payments, row.line, "戶號", "正規化後重複")
		}
		seen[id] = true
		values := [3]bool{}
		for i := range values {
			values[i], err = paid(row.values[i+2])
			if err != nil {
				return result, issue(Payments, row.line, paymentHeaders[i+2], err.Error())
			}
		}
		result.Payments = append(result.Payments, domain.Payment{Household: id, Motorcycle: values[0], Large: values[1], Small: values[2]})
	}
	if len(seen) != len(buildings) {
		return result, issue(Payments, 1, "戶號", "繳費表須包含0/登記的全部戶別，不可只匯出已繳戶")
	}
	sort.Slice(result.Payments, func(i, j int) bool {
		return domain.HouseholdLess(result.Payments[i].Household, result.Payments[j].Household)
	})
	sum := sha256.Sum256(raw)
	source, err := json.Marshal(struct {
		FileName   string `json:"fileName"`
		SHA256     string `json:"sha256"`
		ImportedAt string `json:"importedAt"`
	}{Payments, hex.EncodeToString(sum[:]), importedAt.UTC().Format(time.RFC3339Nano)})
	if err != nil {
		return result, err
	}
	result.Source = source
	return result, nil
}
