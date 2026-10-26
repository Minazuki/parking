package inputcsv

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Minazuki/parking/server/src/internal/domain"
)

const fixture = "../../../../examples/imports/inputs"

func file(t *testing.T, name string) []byte {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(fixture, name))
	if err != nil {
		t.Fatal(err)
	}
	return raw
}
func firstFixture(t *testing.T) domain.First {
	t.Helper()
	data, err := os.ReadFile("../../../../examples/workspace/checkpoints/0/state.json")
	if err != nil {
		t.Fatal(err)
	}
	var first domain.First
	if err := json.Unmarshal(data, &first); err != nil {
		t.Fatal(err)
	}
	return first
}
func TestTemplateColumnsNormalizeAndReproducePreparedPools(t *testing.T) {
	a, b, accessible := file(t, RegistrationA), file(t, RegistrationB), file(t, Accessible)
	// Google exports can contain a UTF-8 BOM, CRLF and whitespace around fields.
	a = bytes.ReplaceAll(a, []byte("\n"), []byte("\r\n"))
	a = append([]byte{0xef, 0xbb, 0xbf}, a...)
	a = bytes.Replace(a, []byte("999-02F"), []byte(" 999-02F "), 1)
	input, err := ParseRegistration(a, b, accessible)
	if err != nil {
		t.Fatal(err)
	}
	got, err := domain.BuildFirst(input.Registrations, input.Assignments)
	if err != nil {
		t.Fatal(err)
	}
	actual, _ := json.Marshal(got)
	want, _ := json.Marshal(firstFixture(t))
	if !domain.EqualJSON(actual, want) {
		t.Fatal("CSV normalization changed prepared fixture")
	}
	// Summary-only rows and the standard warning region do not create households.
	a = append(a, []byte(",,,,,腳踏車（小）,4,19,未滿,\r\n")...)
	if _, err := ParseRegistration(a, b, accessible); err != nil {
		t.Fatal(err)
	}
}
func TestRejectsAmbiguousRegistrationAndAccessibleInput(t *testing.T) {
	original := file(t, RegistrationA)
	b, access := file(t, RegistrationB), file(t, Accessible)
	cases := []struct {
		name       string
		data       []byte
		other      []byte
		accessible []byte
	}{
		{"missing flag", bytes.Replace(original, []byte("兩輪"), []byte(""), 1), b, access},
		{"old bicycle participation", bytes.Replace(original, []byte("一輪"), []byte("參與"), 1), b, access},
		{"normalized duplicate", append(append([]byte{}, original...), []byte("999-2,1,0,0\r\n")...), b, access},
		{"cross-building duplicate", original, append(append([]byte{}, b...), []byte("999-02F,1,0,0\r\n")...), access},
		{"unknown header", bytes.Replace(original, []byte("機車位"), []byte("機車意願"), 1), b, access},
		{"non-utf8", []byte{0xff, 0xfe, 0, 0}, b, access},
		{"malformed csv", []byte("戶號,機車位,腳踏車（大）,腳踏車（小）\n\"unterminated"), b, access},
		{"unknown accessible household", original, b, bytes.Replace(access, []byte("1,14,,,"), []byte("1,14,777-2,,"), 1)},
		{"wrong accessible slot", original, b, bytes.Replace(access, []byte("1,14"), []byte("1,2"), 1)},
		{"missing accessible slot", original, b, []byte("登記順位,配置車位,戶號\n1,14,\n2,2,\n")},
		{"oversized", bytes.Repeat([]byte("x"), MaxBytes+1), b, access},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := ParseRegistration(tc.data, tc.other, tc.accessible)
			var detail *Issue
			if !errors.As(err, &detail) || detail.Row < 1 || detail.FileName == "" || detail.Column == "" {
				t.Fatalf("missing location: %v", err)
			}
		})
	}
	for _, data := range []string{
		"登記順位,配置車位,戶號\n1,14,\n2,2,999-2\n3,3,\n",
		"登記順位,配置車位,戶號\n1,14,999-2\n2,2,999-02F\n3,3,\n",
	} {
		if _, err := ParseRegistration(original, b, []byte(data)); err == nil {
			t.Fatal("invalid accessible order accepted")
		}
	}
	none := []byte("登記順位,配置車位,戶號\n1,14,\n2,2,\n3,3,\n")
	result, err := ParseRegistration(original, b, none)
	if err != nil || len(result.Assignments) != 0 {
		t.Fatal(result.Assignments, err)
	}
}
func TestPaymentCheckboxesCoverageAndExactSourceDigest(t *testing.T) {
	first := firstFixture(t)
	raw := append([]byte{0xef, 0xbb, 0xbf}, bytes.ReplaceAll(file(t, Payments), []byte("\n"), []byte("\r\n"))...)
	when := time.Date(2026, 11, 30, 18, 0, 0, 0, time.FixedZone("Taipei", 8*3600))
	got, err := ParsePayments(raw, first, when)
	if err != nil {
		t.Fatal(err)
	}
	if err := domain.ValidatePayments(got, first); err != nil {
		t.Fatal(err)
	}
	var source struct {
		FileName   string
		SHA256     string
		ImportedAt string
	}
	if err := json.Unmarshal(got.Source, &source); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(raw)
	if source.FileName != Payments || source.SHA256 != hex.EncodeToString(sum[:]) || source.ImportedAt != "2026-11-30T10:00:00Z" {
		t.Fatal(source)
	}
	var expected domain.Payments
	data, err := os.ReadFile("../../../../examples/workspace/checkpoints/3/state.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &expected); err != nil {
		t.Fatal(err)
	}
	x, _ := json.Marshal(got.Payments)
	y, _ := json.Marshal(expected.Payments)
	if !bytes.Equal(x, y) {
		t.Fatal("checkboxes differ from fixture")
	}
	numeric := bytes.ReplaceAll(bytes.ReplaceAll(raw, []byte("TRUE"), []byte("1")), []byte("FALSE"), []byte("0"))
	if _, err := ParsePayments(numeric, first, when); err != nil {
		t.Fatal(err)
	}
	for _, bad := range [][]byte{
		bytes.Replace(raw, []byte("TRUE"), []byte(""), 1),
		bytes.Replace(raw, []byte("FALSE"), []byte("yes"), 1),
		bytes.Replace(raw, []byte("A棟"), []byte("B棟"), 1),
		bytes.Replace(raw, []byte("999-2"), []byte("777-2"), 1),
		[]byte(strings.SplitN(string(raw), "\n", 3)[0] + "\n"),
		append(append([]byte{}, raw...), []byte("A,999-02F,TRUE,FALSE,FALSE\n")...),
	} {
		if _, err := ParsePayments(bad, first, when); err == nil {
			t.Fatal("ambiguous payment CSV accepted")
		}
	}
}

func TestAccessibleDerivedColumnsAreRecomputedFromRegistration(t *testing.T) {
	a, b := file(t, RegistrationA), file(t, RegistrationB)
	for _, tc := range []struct {
		house    string
		transfer bool
	}{{"999-02F", true}, {"997-02F", false}} {
		// Deliberately stale computed columns are not authoritative inputs.
		accessible := []byte("登記順位,配置車位,戶號,棟別,撥補B棟車位\n3,3,,,\n1,14," + tc.house + ",錯誤,999\n2,2,,,\n")
		input, err := ParseRegistration(a, b, accessible)
		if err != nil {
			t.Fatal(err)
		}
		first, err := domain.BuildFirst(input.Registrations, input.Assignments)
		if err != nil {
			t.Fatal(err)
		}
		if (len(first.Accessible.Transferred) == 1) != tc.transfer {
			t.Fatal(first.Accessible)
		}
		if tc.transfer && first.Accessible.Transferred[0] != "86" {
			t.Fatal(first.Accessible.Transferred)
		}
		spaces := map[string]bool{}
		for _, candidate := range first.Pools[1].Candidates {
			spaces[*candidate.SpaceID] = true
		}
		if spaces["14"] || spaces["14-1"] || !spaces["2"] || !spaces["2-1"] || !spaces["3"] || !spaces["3-1"] {
			t.Fatal("accessible split pool differs", spaces)
		}
	}
}
