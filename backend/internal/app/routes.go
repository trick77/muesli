// Package app wires the router and middleware stack.
package app

import (
	"log/slog"
	"net/http"

	"github.com/trick77/ship/kit/httpx"
	"github.com/trick77/ship/kit/version"
)

// TrustedHops is the number of proxies in front of the server: one Traefik. Running without a proxy means 0.
const TrustedHops = 1

// ClientIP is the caller's address as the trusted proxy saw it.
func ClientIP(r *http.Request) string { return httpx.ClientIP(r, TrustedHops) }

// Build returns the root handler; static serves the UI (web.Handler).
func Build(static http.Handler) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/version", func(w http.ResponseWriter, _ *http.Request) {
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"version": version.String()})
	})
	// /healthz and /readyz answer only a direct local caller (the binary's own -healthcheck); through the proxy
	// they are 404. Nothing to check: the UI is embedded.
	httpx.Health(mux, slog.Default())
	mux.Handle("/", static)
	return chain(mux)
}

// chain wraps h in the middleware every request passes. SecurityHeaders sits outside Recover, so a panic's 500
// keeps its headers.
func chain(h http.Handler) http.Handler {
	return httpx.Chain(h,
		httpx.AccessLog(slog.Default(), httpx.AccessLogOptions{ClientIP: ClientIP, RoutineLevel: slog.LevelInfo}),
		httpx.SecurityHeadersWith(httpx.SecurityOptions{HTMLOnly: true}),
		httpx.Recover(slog.Default()),
	)
}
