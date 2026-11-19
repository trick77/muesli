// Package web embeds the built UI: ui/ builds straight into dist/, which git holds only as .gitkeep (ship check and
// the image build fill it).
package web

import (
	"embed"
	"io/fs"
	"net/http"

	"github.com/trick77/ship/kit/spa"
)

//go:embed all:dist
var embedded embed.FS

// Handler serves the embedded UI: real files as they are, /assets/ cached forever, the shell only at /. The game has
// no client router, and with vite's base './' a deep path would resolve ./assets/ under itself: anything else is a
// 404. Every URL in the page is relative, so the same build runs at a domain root or behind a stripped sub-path.
func Handler() (http.Handler, error) {
	dist, err := fs.Sub(embedded, "dist")
	if err != nil {
		return nil, err
	}
	return serve(dist), nil
}

func serve(dist fs.FS) http.Handler {
	h := spa.Handler(dist, spa.Options{Routes: func(p string) bool { return p == "/" }})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// The service worker keeps its name across releases: revalidated every time, or a new release waits for
		// the browser's own heuristic.
		if r.URL.Path == "/sw.js" {
			w.Header().Set("Cache-Control", "no-cache")
		}
		h.ServeHTTP(w, r)
	})
}
