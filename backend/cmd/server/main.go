// Command server serves the embedded game.
package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"os"
	"time"

	"github.com/trick77/ship/kit/env"
	"github.com/trick77/ship/kit/httpx"
	"github.com/trick77/ship/kit/logging"
	"github.com/trick77/ship/kit/run"
	"github.com/trick77/ship/kit/version"

	"github.com/trick77/muesli/backend/internal/app"
	"github.com/trick77/muesli/backend/web"
)

const addr = ":8080"

// The container healthcheck: distroless has no wget.
var healthcheckFlag = flag.Bool("healthcheck", false, "probe the local /readyz and exit 0 (ready) or 1 (not)")

func main() {
	flag.Parse()
	if *healthcheckFlag {
		os.Exit(httpx.Healthcheck(httpx.LocalURL(addr, "/readyz")))
	}
	if err := serve(); err != nil {
		slog.Error("fatal", logging.Err(err))
		os.Exit(1)
	}
}

func serve() error {
	e := env.New(os.Getenv)
	logLevel := e.String("BACKEND_LOG_LEVEL", "info")
	if err := e.Err(); err != nil {
		return err
	}
	if _, err := logging.Setup(logging.Options{Level: logLevel}); err != nil {
		return err
	}
	slog.Info("starting muesli", "version", version.String())

	ctx, stop := run.Context(context.Background())
	defer stop()

	static, err := web.Handler()
	if err != nil {
		return err
	}
	srv := httpx.NewServer(addr, app.Build(static))
	// Static files only, the largest a few hundred KiB.
	srv.ReadTimeout = 30 * time.Second
	srv.WriteTimeout = 30 * time.Second

	slog.Info("listening", "addr", addr)
	err = httpx.Serve(ctx, srv, 10*time.Second)
	// Past the drain deadline Shutdown cut the remaining connections; the process still exits as asked.
	if errors.Is(err, context.DeadlineExceeded) {
		slog.Warn("shutdown deadline passed, open connections cut")
		return nil
	}
	return err
}
