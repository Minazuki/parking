package inputcsv

import (
	"fmt"
	"sort"
	"strconv"

	"github.com/Minazuki/parking/server/src/internal/domain"
)

var registrationHeaders = []string{"戶號", "機車位", "腳踏車（大）", "腳踏車（小）", "", "腳踏車名額", "已登記", "車位數", "狀態", "處理提醒"}
var accessibleHeaders = []string{"登記順位", "配置車位", "戶號", "棟別", "撥補B棟車位"}

type RegistrationInput struct {
	Registrations domain.Registrations
	Assignments   []domain.AccessibleAssignment
}

func ParseRegistration(a, b, accessible []byte) (RegistrationInput, error) {
	result := RegistrationInput{Registrations: domain.Registrations{A: []domain.Registration{}, B: []domain.Registration{}}, Assignments: []domain.AccessibleAssignment{}}
	known := map[string]string{}
	for index, source := range []struct {
		name string
		raw  []byte
	}{{RegistrationA, a}, {RegistrationB, b}} {
		table, err := readTable(source.name, source.raw, 4, registrationHeaders)
		if err != nil {
			return result, err
		}
		rows := []domain.Registration{}
		for _, row := range table.rows {
			if empty(row.values[:4]) {
				continue
			} // Sheets summary-only rows are not households.
			id, err := household(row.values[0])
			if err != nil {
				return result, issue(source.name, row.line, "戶號", err.Error())
			}
			if previous, ok := known[id]; ok {
				return result, issue(source.name, row.line, "戶號", fmt.Sprintf("正規化後重複，先前位於%s", previous))
			}
			known[id] = fmt.Sprintf("%s第%d列", source.name, row.line)
			values := [3]int{}
			for i := range values {
				values[i], err = intent(row.values[i+1], i > 0)
				if err != nil {
					return result, issue(source.name, row.line, registrationHeaders[i+1], err.Error())
				}
			}
			rows = append(rows, domain.Registration{Household: id, Motorcycle: values[0], Large: values[1], Small: values[2]})
		}
		if index == 0 {
			result.Registrations.A = rows
		} else {
			result.Registrations.B = rows
		}
	}
	table, err := readTable(Accessible, accessible, 3, accessibleHeaders)
	if err != nil {
		return result, err
	}
	spaces := []string{"14", "2", "3"}
	orders := map[int]bool{}
	seenHouse := map[string]bool{}
	assignedRows := map[int]int{}
	for _, row := range table.rows {
		if empty(row.values) {
			continue
		}
		order, err := strconv.Atoi(row.values[0])
		if err != nil || order < 1 || order > 3 || orders[order] {
			return result, issue(Accessible, row.line, "登記順位", "順位須為不重複的1、2、3")
		}
		orders[order] = true
		if row.values[1] != spaces[order-1] {
			return result, issue(Accessible, row.line, "配置車位", "順位1、2、3須分別配置14、2、3")
		}
		if row.values[2] == "" {
			continue
		} // Reserved accessible rows with no applicant are valid.
		id, err := household(row.values[2])
		if err != nil {
			return result, issue(Accessible, row.line, "戶號", err.Error())
		}
		if _, ok := known[id]; !ok {
			return result, issue(Accessible, row.line, "戶號", "未出現在本次A／B棟登記")
		}
		if seenHouse[id] {
			return result, issue(Accessible, row.line, "戶號", "同戶不能重複配置無障礙位")
		}
		seenHouse[id] = true
		result.Assignments = append(result.Assignments, domain.AccessibleAssignment{Order: order, Household: id, SpaceID: spaces[order-1]})
		assignedRows[order] = row.line
	}
	// All three protected slots must be present; never infer missing fixed rows.
	if len(orders) != 3 {
		return result, issue(Accessible, 1, "登記順位", "須保留樣板的三筆固定順位資料，無申請者留空戶號")
	}
	sort.Slice(result.Assignments, func(i, j int) bool { return result.Assignments[i].Order < result.Assignments[j].Order })
	for i, assignment := range result.Assignments {
		if assignment.Order != i+1 {
			return result, issue(Accessible, assignedRows[assignment.Order], "登記順位", "已填戶號須從第一順位連續登記")
		}
	}
	return result, nil
}
