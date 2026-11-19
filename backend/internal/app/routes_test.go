package app

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func do(h http.Handler, r *http.Request) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func TestRoutes(t *testing.T) {
	static := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("ui")) })
	h := Build(static)
	if w := do(h, httptest.NewRequest("GET", "/", nil)); w.Body.String() != "ui" {
		t.Errorf("GET /: %q", w.Body)
	}
	if w := do(h, httptest.NewRequest("GET", "/api/version", nil)); w.Code != http.StatusOK ||
		!strings.Contains(w.Body.String(), `"version":`) {
		t.Errorf("GET /api/version: %d %s", w.Code, w.Body)
	}
}

func TestReadyz_LocalOnly(t *testing.T) {
	h := Build(http.NotFoundHandler())
	r := httptest.NewRequest("GET", "/readyz", nil)
	r.RemoteAddr = "127.0.0.1:1234"
	if w := do(h, r); w.Code != http.StatusOK {
		t.Errorf("local /readyz: %d", w.Code)
	}
	r = httptest.NewRequest("GET", "/readyz", nil)
	r.RemoteAddr = "127.0.0.1:1234"
	r.Header.Set("X-Forwarded-For", "203.0.113.9")
	if w := do(h, r); w.Code != http.StatusNotFound {
		t.Errorf("proxied /readyz: %d, want 404", w.Code)
	}
}
