package beacon

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func fixture(t *testing.T) ([]byte, []byte) {
	t.Helper()
	a, err := os.ReadFile("../../../../examples/drand-quicknet-v2-info.json")
	if err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile("../../../../examples/drand-quicknet-v2-round-33382601.json")
	if err != nil {
		t.Fatal(err)
	}
	return a, b
}
func TestVerifyPublicQuicknet(t *testing.T) {
	a, b := fixture(t)
	seed, round, when, err := Verify(a, b)
	if err != nil {
		t.Fatal(err)
	}
	if seed != "7010277ecb91976aba93d63d298503889de63e291a5a49f7c1b8d2cce2b3e858" || round != 33382601 || when != "2026-10-25T17:59:27.000Z" {
		t.Fatal("wrong derivation")
	}
	for _, bad := range [][2][]byte{{a, []byte(`{"round":33382602,"signature":"00"}`)}, {[]byte(strings.Replace(string(a), "quicknet", "fake", 1)), b}} {
		if _, _, _, err := Verify(bad[0], bad[1]); err == nil {
			t.Fatal("invalid proof accepted")
		}
	}
}
func TestFetchUsesV2AndDoesNotRetry(t *testing.T) {
	a, b := fixture(t)
	calls := []string{}
	fail := false
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls = append(calls, r.URL.Path)
		if r.Header.Get("Accept") != "application/json" {
			t.Error("missing accept")
		}
		if fail {
			w.WriteHeader(503)
			return
		}
		if r.URL.Path == "/info" {
			w.Write(a)
		} else {
			w.Write(b)
		}
	}))
	defer s.Close()
	fetch := Fetcher{Client: s.Client(), BaseURL: s.URL}
	e, err := fetch.Fetch(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if err := Validate(e); err != nil {
		t.Fatal(err)
	}
	if strings.Join(calls, ",") != "/info,/rounds/latest" {
		t.Fatal(calls)
	}
	calls = nil
	fail = true
	if _, err := fetch.Fetch(context.Background()); err == nil {
		t.Fatal("HTTP failure accepted")
	}
	if len(calls) != 1 {
		t.Fatal("request retried")
	}
}
