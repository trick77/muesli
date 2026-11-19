package web

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
)

func TestServe(t *testing.T) {
	h := serve(fstest.MapFS{
		"index.html":           {Data: []byte("<!doctype html><title>shell</title>")},
		"assets/index.js":      {Data: []byte("export {}")},
		"sw.js":                {Data: []byte("self")},
		"manifest.webmanifest": {Data: []byte("{}")},
	})
	for path, want := range map[string]int{
		"/":                     http.StatusOK,
		"/assets/index.js":      http.StatusOK,
		"/sw.js":                http.StatusOK,
		"/manifest.webmanifest": http.StatusOK,
		"/some/route":           http.StatusNotFound,
		"/api/nope":             http.StatusNotFound,
	} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != want {
			t.Errorf("%s: status=%d, want %d", path, w.Code, want)
		}
		if path == "/sw.js" && w.Header().Get("Cache-Control") != "no-cache" {
			t.Errorf("/sw.js: Cache-Control %q", w.Header().Get("Cache-Control"))
		}
	}
}

func TestHandler_ServesTheEmbed(t *testing.T) {
	h, err := Handler()
	if err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
	// A built dist answers 200, the unbuilt .gitkeep-only one kit's 503 placeholder.
	if w.Code != http.StatusOK && w.Code != http.StatusServiceUnavailable {
		t.Fatalf("status=%d", w.Code)
	}
}
