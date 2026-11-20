# AGENTS.md

Screen hunting game for a cat: bright prey on black, caught with a paw. `ui/`: Vite + TypeScript, zero runtime deps,
Canvas 2D. `backend/`: Go (ship kit), serves the embedded UI only (no database).

## Targets
- iPad (landscape and portrait), iPhone, desktop. Test with Playwright WebKit (`npm run e2e` in `ui/`).
- iOS ignores `user-scalable=no`: keep `touch-action: none` + preventDefault on touch/gesture events.
- Audio only after a user gesture (`audio.unlock()` on the start tap). iPhone Safari has no element fullscreen:
  home-screen install (manifest `display: fullscreen`). Wake lock in an installed iOS app only from iOS 18.4.

## Game rules that are decisions, not accidents
- Colours: cyan/yellow/lime/blue only. Cats are dichromats: red, orange, pink, purple read as dark grey.
- Shapes: flat silhouettes, no eyes or inner detail (cats see coarse up close; a GDC 2019 cat-game talk reported
  realistic mice failing). Tail and legs thick: the moving outline is what counts.
- Size: radius 2.25 % of the short edge, 12..28 px. The first 4.5 % looked twice too big on desktop and iPad (user).
- Away off screen: random 0.5..10 s, evenly drawn (user: first 20 s, then "max 10s"). Exits every 10..30 s on screen.
- Lurk (no touch for a while) keeps looks long and gaps short: at 3 s on screen and 8..15 s away the screen sat
  black ~10 s again and again (user).
- Look (shape/colour/size) changes only while off screen: Hall, Bradshaw & Robinson 2002, play collapses on an
  unchanging toy and comes back for a changed one.
- Sessions end on their own (2/3/5 min, default 2) with a catchable last prey: laser-pointer play that never ends in a
  catch is linked to compulsive behaviour (Kogan & Grigg 2021). Restart takes a 1 s hold: a paw tap starts nothing.
- Pause: two opposite spots held 1.5 s, inset 12 % (iOS delays touches at the screen edge; one paw cannot hold two).
- Flee goes to the nearest wall away from the paw, not the longest open run: the `?trace` view showed screensaver
  arcs through the middle with the longer runs.
- Escape after hits in a row, zigzagging off screen: the user's wish. Edge chosen ~0.6 shorts away, not the nearest:
  pressed to a wall the run was over before a swerve showed.
- A peeking prey that is scared or hit ducks out and peeks again; it does not leave for good (it was away ~70 % of
  the time with a cat at the edge).

## Code
- `game/` is pure and seeded (`Rng`): no DOM, audio, `Math.random` or clock. `tests/game/behaviour.test.ts` checks
  the plan's guarantees over many seeds; a change to movement must keep it green, not loosen it.
- `?trace[=seconds]&seed=N`: a whole session's path coloured by speed band. `?demo`: a pretend cat plays.
  `e2e/shots.ts` (preview running, ffmpeg, unsandboxed) remakes `docs/hunt.gif` and `docs/trace.png`. The GIF is
  recorded at 560x392: the prey keeps its 12 px minimum radius, so a small screen shows it big enough to see.
- Learning (`game/learn.ts`) stays per device in localStorage; weights only after 3 sessions with touches, within 2x.

## Dev / prod
- Dev: `npm run dev` in `ui/`; full server: `npm run build` in `ui/`, then `go run ./cmd/server` in `backend/`.
- Gate: `make check` (= ship check; `make hooks` once per clone).
- Commit subjects + PR titles: Go style `area: what` (`backend: …`, `ui: …`), gated by ship; release notes list them by area.
- Fresh clone: `ship hooks` before the first push (check, conform and init install it too); without the pre-push hook a push skips the gate.
- Prod: `compose.yaml` pulls `ghcr.io/trick77/muesli` behind Traefik under a sub-path (StripPrefix, slash redirect).
  Hostname and path only in `.env` (`PUBLIC_FQDN`, `PUBLIC_PATH`), never in config, code or tests: examples use
  `example.com` and `/game`. The README's "Play it" link is the one exception (user asked for it). Every URL in the
  page is relative (vite base `./`).
- Release: Actions "Release" by hand (bump input); the first one `bump=minor`. Never dispatch Release yourself.
- Go and Playwright need to run unsandboxed (caches, browser launch).
