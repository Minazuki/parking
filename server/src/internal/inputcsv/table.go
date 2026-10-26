// Package inputcsv converts external administrative CSV into typed domain inputs.
package inputcsv

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

const (
	RegistrationA = "A棟資料.csv"
	RegistrationB = "B棟資料.csv"
	Accessible    = "無障礙車位資料.csv"
	Payments      = "第一輪繳費狀態.csv"
	MaxBytes      = 1 << 20
)

// Issue points to the original CSV location, without copying resident data to logs.
type Issue struct {
	FileName string `json:"fileName"`
	Row      int    `json:"row"`
	Column   string `json:"column"`
	Message  string `json:"message"`
}

func (e *Issue) Error() string {
	return fmt.Sprintf("%s 第%d列 %s：%s", e.FileName, e.Row, e.Column, e.Message)
}
func issue(file string, row int, column, message string) error {
	return &Issue{FileName: file, Row: row, Column: column, Message: message}
}

type row struct {
	line   int
	values []string
}
type table struct {
	file string
	rows []row
}

func canonicalHeader(s string) string {
	return strings.NewReplacer("（", "(", "）", ")").Replace(strings.TrimSpace(s))
}

// expected contains all accepted columns, including explicitly ignored computed columns.
func readTable(file string, raw []byte, required int, expected []string) (table, error) {
	result := table{file: file, rows: []row{}}
	if len(raw) > MaxBytes {
		return result, issue(file, 1, "檔案", "檔案超過1MiB")
	}
	if !utf8.Valid(raw) || bytes.IndexByte(raw, 0) >= 0 {
		return result, issue(file, 1, "編碼", "只接受UTF-8，請從Google Sheets下載CSV")
	}
	raw = bytes.TrimPrefix(raw, []byte{0xef, 0xbb, 0xbf})
	reader := csv.NewReader(bytes.NewReader(raw))
	reader.FieldsPerRecord = -1
	header, err := reader.Read()
	if err != nil {
		return result, csvError(file, err)
	}
	if len(header) < required {
		return result, issue(file, 1, "表頭", "缺少必要欄位")
	}
	for i, h := range header {
		want := ""
		if i < len(expected) {
			want = expected[i]
		}
		if canonicalHeader(h) != canonicalHeader(want) {
			return result, issue(file, 1, fmt.Sprintf("第%d欄", i+1), "表頭或欄位順序不符；請使用原樣板匯出")
		}
	}
	for {
		values, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return result, csvError(file, err)
		}
		line, _ := reader.FieldPos(0)
		for i := range values {
			values[i] = strings.TrimSpace(values[i])
		}
		// Only columns with a named, known purpose may contain values.
		for i, value := range values {
			if i >= required && (i >= len(header) || i >= len(expected) || expected[i] == "") && value != "" {
				return result, issue(file, line, fmt.Sprintf("第%d欄", i+1), "未定義的欄位含有資料")
			}
		}
		for len(values) < required {
			values = append(values, "")
		}
		result.rows = append(result.rows, row{line, values})
	}
	return result, nil
}
func csvError(file string, err error) error {
	if err == io.EOF {
		return issue(file, 1, "表頭", "CSV為空")
	}
	if e, ok := err.(*csv.ParseError); ok {
		return issue(file, e.Line, "CSV格式", e.Err.Error())
	}
	return issue(file, 1, "CSV格式", err.Error())
}
func empty(values []string) bool {
	for _, v := range values {
		if v != "" {
			return false
		}
	}
	return true
}

var householdPattern = regexp.MustCompile(`^([0-9]+)-([0-9]+)[Ff]?$`)

func household(value string) (string, error) {
	match := householdPattern.FindStringSubmatch(value)
	if match == nil {
		return "", fmt.Errorf("戶號須為門牌-樓層，例如999-2或999-02F")
	}
	parts := make([]int64, 2)
	for i := range parts {
		n, err := strconv.ParseInt(match[i+1], 10, 64)
		if err != nil || n < 1 || n > 9007199254740991 {
			return "", fmt.Errorf("門牌與樓層須為正整數")
		}
		parts[i] = n
	}
	return fmt.Sprintf("%d-%d", parts[0], parts[1]), nil
}
func intent(value string, bicycle bool) (int, error) {
	switch value {
	case "0":
		return 0, nil
	case "1", "一輪":
		return 1, nil
	case "2", "兩輪":
		return 2, nil
	case "放棄":
		if !bicycle {
			return 0, nil
		}
	case "不參與":
		if bicycle {
			return 0, nil
		}
	}
	return 0, fmt.Errorf("須填寫有效的0／1／2或下拉選項，空白不視為預設值")
}
func paid(value string) (bool, error) {
	switch strings.ToUpper(value) {
	case "TRUE", "1":
		return true, nil
	case "FALSE", "0":
		return false, nil
	}
	return false, fmt.Errorf("須為TRUE／FALSE或1／0，空白不視為未繳")
}
