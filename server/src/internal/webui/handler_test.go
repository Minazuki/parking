package webui

import (
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestEmbeddedFilesOnly(t *testing.T) {
	if Handler(nil) != nil {
		t.Fatal("development build must not require frontend files")
	}
	handler := Handler(fstest.MapFS{
		"index.html":         {Data: []byte("<!doctype html><html>parking</html>")},
		"assets/app-123.js":  {Data: []byte("export const version = 1")},
		"assets/app-123.css": {Data: []byte("body { color: white }")},
	})
	for _, tc := range []struct {
		method, path    string
		status          int
		contains, cache string
	}{
		{"GET", "/", 200, "parking", "no-cache"},
		{"GET", "/index.html", 200, "parking", "no-cache"},
		{"GET", "/assets/app-123.js", 200, "export const", "public, max-age=31536000, immutable"},
		{"HEAD", "/assets/app-123.js", 200, "", "public, max-age=31536000, immutable"},
		{"GET", "/assets/missing.js", 404, "404", ""},
		{"GET", "/assets/", 404, "404", ""},
		{"GET", "/assets/../index.html", 404, "404", ""},
		{"GET", "/inputs/private.csv", 404, "404", ""},
		{"POST", "/index.html", 405, "method not allowed", ""},
	} {
		t.Run(tc.method+tc.path, func(t *testing.T) {
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, httptest.NewRequest(tc.method, tc.path, nil))
			if w.Code != tc.status || !strings.Contains(w.Body.String(), tc.contains) {
				t.Fatalf("status %d body %q", w.Code, w.Body.String())
			}
			if tc.method == "HEAD" && w.Body.Len() != 0 {
				t.Fatal("HEAD returned body")
			}
			if tc.cache != "" && w.Header().Get("Cache-Control") != tc.cache {
				t.Fatal("cache policy")
			}
			if tc.status == 200 && w.Header().Get("X-Content-Type-Options") != "nosniff" {
				t.Fatal("missing nosniff")
			}
			if tc.status == 404 && strings.Contains(w.Body.String(), "<html>") {
				t.Fatal("missing files returned app HTML")
			}
		})
	}
}
