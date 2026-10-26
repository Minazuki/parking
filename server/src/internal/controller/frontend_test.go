package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/Minazuki/parking/server/src/internal/webui"
)

func TestFrontendKeepsAPIBoundary(t *testing.T) {
	// Static serving must not touch the activity service; no service is needed here.
	handler := Handler(nil, Config{Host: "127.0.0.1:8080", Frontend: webui.Handler(fstest.MapFS{
		"index.html":        {Data: []byte("<!doctype html><html>parking</html>")},
		"assets/app-123.js": {Data: []byte("console.log('parking')")},
	})})
	for _, tc := range []struct {
		path, host string
		status     int
		content    string
	}{
		{"/", "127.0.0.1:8080", 200, "text/html"},
		{"/assets/app-123.js", "127.0.0.1:8080", 200, "javascript"},
		{"/api/v1/missing", "127.0.0.1:8080", 404, "application/json"},
		{"/", "untrusted.example", 403, "application/json"},
	} {
		w := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080"+tc.path, nil)
		r.Host = tc.host
		handler.ServeHTTP(w, r)
		if w.Code != tc.status || !strings.Contains(w.Header().Get("Content-Type"), tc.content) {
			t.Fatalf("%s: %d %s", tc.path, w.Code, w.Header().Get("Content-Type"))
		}
	}
}
