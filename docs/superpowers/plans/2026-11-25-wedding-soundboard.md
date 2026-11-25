# Wedding Soundboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted Next.js + SQLite web app. One operator uses it to run wedding
music from a laptop. It covers:
- an uploadable, manageable music library;
- multiple events, each with a looping background playlist and a cue script, and smooth
  fades;
- an offline Live mode that starts only after every track is cached and verified.

**Architecture:**
- One Next.js Node server (`output: 'standalone'`).
- SQLite via better-sqlite3 + Drizzle. Music files live on disk under `DATA_DIR`.
- Own email/password sessions (argon2id, `sessions` table).
- Data writes go through Server Actions. Uploads, file streaming and backup go through
  Route Handlers.
- Playback is a **pure state machine** (`reduce(state, event) → {state, commands}`). A
  thin Web Audio driver runs the commands over 4 decks (`bg0`, `bg1`, `cue0`, `cue1`).
- Live reads a frozen snapshot from `localStorage` and plays blobs from Cache Storage. A
  Serwist service worker precaches `/live`, so Live never touches the network.
- Dev: `npm run dev`, no Docker. Deploy: Docker + Caddy, with one volume at `/data`.

**Tech Stack:** Next.js (App Router, TS), Tailwind, shadcn/ui, dnd-kit, better-sqlite3,
drizzle-orm + drizzle-kit, @node-rs/argon2, music-metadata, Serwist (`@serwist/next`),
Zod, Vitest + Testing Library, Playwright, tsx.

**Spec:** `docs/superpowers/specs/2026-11-25-wedding-soundboard-design.md`

## Global Constraints

**Platform and copy**
- Target browsers: desktop Chrome and Edge, current versions.
- UI copy is **Vietnamese only**. Quoted Vietnamese strings in this plan are exact copy.

**Playback safety**
- **No instant stop anywhere.** Every ramp has `seconds >= 0.1`. The only stop button is
  "Fade out & dừng".
- Live shortcuts:

  | Key | Action |
  |---|---|
  | `N` | next cue |
  | `B` | back to background |
  | `F` | fade out & stop |
  | `ArrowUp` / `ArrowDown` | master volume ±5% |
  | Space | **must do nothing** |

**Defaults** (`EventSettings`): `cueFadeSec 3`, `bgCrossfadeSec 4`, `stopFadeSec 3`,
`bgVolume 0.7`, `masterVolume 0.9`, `shuffle false`.

**Environment variables**
- `DATA_DIR`: default `./data`. The DB is `${DATA_DIR}/app.db` and music is in
  `${DATA_DIR}/music/`.
- `ADMIN_EMAIL` and `ADMIN_PASSWORD`: create the first admin when the `users` table is
  empty.
- `MAX_UPLOAD_MB`: default `100`.

**Uploads**
- Accepted extensions are exactly `mp3`, `m4a`, `aac`, `wav`.
- A stored file is named `<song_id>.<ext>`, ASCII only.

**Security**
- Every Route Handler, Server Action and server page calls `requireUser()` (admin-only
  ones call `requireAdmin()`), except `/login`, `/live` and static assets.
- Middleware/proxy checks only that the cookie is present.

**Live mode**
- Never decode whole tracks to PCM. Playback always uses `HTMLAudioElement` on `blob:`
  object URLs.
- Live makes **zero network requests**.

**Dependencies**
- Pin exact dependency versions and commit `package-lock.json`.
- Before choosing APIs, check the installed Next.js version's docs. Next 16 renames
  `middleware.ts` → `proxy.ts`, and Serwist may require `next build --webpack`.

**Dev machine** (verified 2026-11-25): Node v24.22.3, npm 11.19.1, git 2.40. **No
Docker**, so nothing in Tasks 1–15 may require Docker. Task 16's `docker build` is
verified on the deploy host or in CI.

## Review Focus

These are the input classes most likely to bite a real operator that the feature tests
would not cover by default. Each one is pinned by a named test in the owning task.

1. **Rapid presses during a fade.** Expected: no volume jump; the new ramp starts from
   the current gain. Pinned by Task 6 `rapid GO_CUE …` and Task 7 `ramp starts from
   current value`.
2. **A cue fires while the background is mid-crossfade.** Expected: both bg decks fade
   out; on resume, only the incoming track continues. Pinned by Task 6 `GO_CUE during
   background crossfade …`.
3. **The background playlist is empty and a cue ends with `resume_background`.**
   Expected: the app goes `silent`, shows "ĐANG IM LẶNG", and does not crash. Pinned by
   Task 6 `empty background …`.
4. **Wrong duration metadata**: `ended` fires before the fade point, or
   `startSec`/`endSec` lie past the real duration. Expected: playback still transitions,
   and Load blocks the cue with a reason. Pinned by Task 6 `CUE_ENDED before fade …` and
   Task 12 `rejects startSec beyond duration`.
5. **Vietnamese diacritic filenames with no tags, and oversized or garbage uploads.**
   Expected: the title is the NFC filename; the stored name is ASCII; the temp file is
   removed on reject. Pinned by Task 8 `falls back to filename …`, `rejects oversize and
   deletes temp file`, and `rejects unreadable audio`.

---

## File Structure

```
package.json, next.config.ts, tsconfig.json, drizzle.config.ts, vitest.config.ts, playwright.config.ts
.env.example                      # DATA_DIR, ADMIN_EMAIL, ADMIN_PASSWORD, MAX_UPLOAD_MB
Dockerfile, docker-compose.yml, Caddyfile, .dockerignore
README.md                         # Vietnamese: dev, deploy, backup, day-of checklist
drizzle/                          # generated SQL migrations
scripts/make-fixtures.ts          # tone WAV fixtures for tests
scripts/create-user.ts            # CLI: create/reset a user (used by e2e and in production)
src/
  middleware.ts (or proxy.ts)     # cookie-presence redirect
  server/
    db/schema.ts, db/client.ts    # Drizzle schema; getDb() with pragmas + auto-migrate
    auth/password.ts, session.ts, rate-limit.ts, require.ts
    music/store.ts                # paths, streaming write, metadata, delete
    repo/songs.ts, folders.ts, events.ts, users.ts
  lib/
    types.ts, validation.ts
    library/hash.ts               # browser sha256 + upload client (XHR progress)
    playback/background-order.ts, machine.ts, audio-driver.ts
    offline/snapshot.ts, music-cache.ts, live-persist.ts
    events/export.ts
  app/
    sw.ts
    login/, library/, events/, events/[id]/, events/[id]/load/, live/, admin/users/
    api/songs/upload/route.ts, api/songs/by-hash/route.ts, api/songs/[id]/file/route.ts
    api/events/[id]/snapshot/route.ts, api/admin/backup/route.ts
tests/                            # Vitest, mirrors src
e2e/                              # Playwright specs, global-setup.ts, fixtures/
```

## Shared domain types (Task 3; used everywhere)

```ts
// src/lib/types.ts
export type CueKind = 'song' | 'background';
export type OnEnd = 'resume_background' | 'stop';
export interface Folder { id: string; name: string; parentId: string | null }
export interface Song {
  id: string; folderId: string | null; title: string; artist: string | null; durationSec: number;
  fileName: string; fileSize: number; mimeType: string; contentHash: string;
}
export interface Cue {
  id: string; position: number; kind: CueKind; name: string; songId: string | null;
  startSec: number; endSec: number | null; fadeInSec: number | null; fadeOutSec: number | null;
  volume: number; /* 0–100 */ onEnd: OnEnd; note: string;
}
export interface EventSettings { cueFadeSec: number; bgCrossfadeSec: number; stopFadeSec: number;
  bgVolume: number; masterVolume: number; /* 0–1 */ shuffle: boolean }
export const DEFAULT_SETTINGS: EventSettings =
  { cueFadeSec: 3, bgCrossfadeSec: 4, stopFadeSec: 3, bgVolume: 0.7, masterVolume: 0.9, shuffle: false };
export interface EventRecord { id: string; name: string; eventDate: string | null; settings: EventSettings; updatedAt: string }
export interface EventDetail { event: EventRecord; background: { id: string; songId: string }[]; cues: Cue[]; songs: Record<string, Song> }
export interface ShowSnapshot { version: 1; eventId: string; eventName: string; takenAt: string;
  settings: EventSettings; songs: Record<string, Song>; background: string[]; /* songIds */ cues: Cue[] }
```

---

### Task 1: Project scaffold

**Files:**
- Create: the root configs, `.env.example`, `.gitignore` (`data/`, `.e2e-data/`,
  `e2e/.auth/`), and a `README.md` stub.
- Create: `src/app/layout.tsx` (`<html lang="vi" class="dark">`) and
  `src/app/page.tsx` (redirects to `/events`).
- Create: `tests/smoke.test.ts` and `e2e/smoke.spec.ts`.

**Interfaces:**
- Produces npm scripts:

  | Script | Runs |
  |---|---|
  | `dev` | the dev server |
  | `build` | the production build |
  | `start` | the production server |
  | `test` | `vitest run` |
  | `test:e2e` | Playwright |
  | `db:generate` | `drizzle-kit generate` |
  | `fixtures` | `tsx scripts/make-fixtures.ts` |
  | `user` | `tsx scripts/create-user.ts` |

- Produces the path alias `@/` → `src/`.
- Sets `next.config.ts` `output: 'standalone'`, and marks `better-sqlite3` and
  `@node-rs/argon2` as `serverExternalPackages`.

- [ ] **Step 1:** Run `git init`, then `npx create-next-app@latest . --ts --tailwind --app --src-dir --eslint --import-alias "@/*"`. Pin exact versions.
- [ ] **Step 2:** Run `npx shadcn@latest init`. Add Vitest (jsdom, Testing Library, jest-dom), Playwright (chromium only) and tsx.
- [ ] **Step 3:** Write `tests/smoke.test.ts` (`expect(1 + 1).toBe(2)`) and `e2e/smoke.spec.ts` (`/` ends on `/login`).
- [ ] **Step 4:** Run `npm test`. Expected: 1 passed. Run `npm run build`. Expected: success.
- [ ] **Step 5:** Commit `chore: scaffold next.js app`.

### Task 2: SQLite schema and DB client

**Files:**
- Create: `src/server/db/schema.ts`, `src/server/db/client.ts`, `drizzle.config.ts`, and
  `drizzle/` (generated).
- Test: `tests/server/db.test.ts`.

**Interfaces:**
- Produces:
  - `getDb(): BetterSQLite3Database<typeof schema>`. This is a singleton on
    `globalThis`. It does the following:
    - opens `${DATA_DIR}/app.db` and creates `DATA_DIR` and `DATA_DIR/music`;
    - sets `foreign_keys=ON`, `journal_mode=WAL`, `busy_timeout=5000`;
    - runs `migrate(db, { migrationsFolder })`.
  - `createTestDb(): BetterSQLite3Database` (`:memory:`, migrated), for tests.
- Schema (Drizzle `sqliteTable`; ids are `text` UUIDs from `crypto.randomUUID()`;
  timestamps are ISO `text`):

  | Table | Columns and constraints |
  |---|---|
  | `users` | `id`, `email` (unique, lowercased), `password_hash`, `is_admin` (int bool), `created_at` |
  | `sessions` | `id` (32-byte base64url token, hashed with SHA-256 before storing), `user_id` (FK to users, cascade), `expires_at` |
  | `folders` | `id`, `name`, `parent_id` (FK to folders, restrict) |
  | `songs` | columns from spec §6.8, plus `search_text` (lowercased NFC `title + ' ' + artist`; SQLite `LOWER` is ASCII-only, so it is needed for Vietnamese search); `content_hash` indexed; `folder_id` (FK, set null) |
  | `events` | `id`, `name`, `event_date`, `settings` (text JSON), `created_at`, `updated_at` |
  | `background_tracks` | `id`, `event_id` (FK, cascade), `position`, `song_id` (FK, restrict) |
  | `cues` | spec §6.8 columns; `volume` int default 100, `CHECK (volume BETWEEN 0 AND 100)`; `kind` `CHECK IN ('song','background')`; `on_end` `CHECK IN ('resume_background','stop')`; `CHECK (kind <> 'song' OR song_id IS NOT NULL)`; `CHECK (end_sec IS NULL OR end_sec > start_sec)`; `CHECK (start_sec >= 0)`; `event_id` FK cascade; `song_id` FK restrict |

- [ ] **Step 1:** Write the tests, each against `createTestDb()`:
  - `foreign keys are enforced`: deleting a song used by a cue throws `SQLITE_CONSTRAINT_FOREIGNKEY`.
  - `deleting event cascades cues and background_tracks`.
  - `song cue without song_id violates check`.
  - `end_sec <= start_sec violates check`.
  - `getDb creates data dir and music dir` (uses a temp `DATA_DIR`).
- [ ] **Step 2:** Run `npx vitest run tests/server/db.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Write the schema, then run `npm run db:generate` and implement the client.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(db): sqlite schema, migrations and client`.

### Task 3: Domain types and validation

**Files:**
- Create: `src/lib/types.ts` (exact content above) and `src/lib/validation.ts`.
- Test: `tests/lib/validation.test.ts`.

**Interfaces:**
- Produces:
  - `cueSchema`. It requires: `kind==='song'` ⇒ `songId`; `endSec==null || endSec>startSec`; `volume` an integer 0–100; fades `null` or within 0.1–30.
  - `settingsSchema` and `parseSettings(raw: unknown): EventSettings`, which fills
    missing keys from `DEFAULT_SETTINGS`. Invalid JSON gives the defaults.

- [ ] **Step 1:** Write the tests:
  - `parseSettings({})` deep-equals `DEFAULT_SETTINGS`.
  - `parseSettings('not json')` deep-equals `DEFAULT_SETTINGS`.
  - `parseSettings({bgVolume:0.5}).cueFadeSec === 3`.
  - A song cue with `songId:null` is rejected.
  - `endSec 10` with `startSec 20` is rejected.
  - A background cue with `songId:null` is accepted.
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: domain types and validation`.

### Task 4: Authentication, sessions and user admin

**Files:**
- Create: `src/server/auth/password.ts`, `session.ts`, `rate-limit.ts`, `require.ts`.
- Create: `src/server/repo/users.ts`.
- Create: `src/middleware.ts` (or `src/proxy.ts`).
- Create: `src/app/login/page.tsx` + `actions.ts`, and
  `src/app/admin/users/page.tsx` + `actions.ts`.
- Create: `scripts/create-user.ts`.
- Test: `tests/server/auth.test.ts`, `e2e/global-setup.ts`, `e2e/auth.spec.ts`.

**Interfaces:**
- Produces:

```ts
hashPassword(pw: string): Promise<string>; verifyPassword(hash: string, pw: string): Promise<boolean>;  // argon2id
createSession(db, userId: string): Promise<{ token: string; expiresAt: Date }>;  // 30 days
validateSession(db, token: string): Promise<{ user: { id: string; email: string; isAdmin: boolean } } | null>; // deletes expired; slides expiry when < 15 days left
invalidateSession(db, token: string): Promise<void>;
export const SESSION_COOKIE = 'sb_session';
requireUser(): Promise<User>;   // reads cookie, validates, else redirect('/login') (pages) / throws 401 (route handlers use requireUserApi(): Promise<User | Response>)
requireAdmin(): Promise<User>;
checkLoginRate(key: string, now?: number): { allowed: boolean; retryAfterSec: number }; // 5 failures / 15 min per email+ip
ensureAdminFromEnv(db): Promise<void>;  // creates ADMIN_EMAIL user if users table empty; called once from src/instrumentation.ts register() (nodejs runtime)
createUser(db, email, password, isAdmin): Promise<User>; resetPassword(db, userId, pw); deleteUser(db, userId); listUsers(db)
```

- Cookie: `HttpOnly`, `SameSite=Lax`, `Secure` when `NODE_ENV==='production'`, `Path=/`.
- Middleware matcher **excludes** `/login`, `/live`, `/sw.js`, `/~offline`,
  `/manifest.webmanifest`, `/_next/*` and `/favicon.ico`. Without a cookie, a request
  redirects to `/login?next=<path>`; for `/api/*` it returns 401.
- Copy:
  - login page: "Đăng nhập", "Mật khẩu", error "Sai email hoặc mật khẩu", throttled
    "Thử lại sau X giây";
  - header button "Đăng xuất";
  - admin page "Người dùng" with "Tạo tài khoản", "Đặt lại mật khẩu", "Xoá". An admin
    cannot delete themselves.
- `scripts/create-user.ts --email x --password y [--admin]` writes to the DB at
  `DATA_DIR`.
- E2E setup: `playwright.config.ts` webServer runs `npm run build && npm start` with
  `DATA_DIR=.e2e-data` (wiped first). `global-setup.ts` generates a random password,
  creates `op@test.local` with `scripts/create-user.ts`, logs in and saves
  `e2e/.auth/state.json`.

- [ ] **Step 1:** Write unit tests (in-memory DB):
  - `verifyPassword true for correct, false for wrong`.
  - `validateSession returns user for fresh token`.
  - `returns null and deletes row when expired`.
  - `stored session id is not the raw token`.
  - `checkLoginRate blocks the 6th failure within 15 min and reports retryAfterSec > 0`.
  - `ensureAdminFromEnv creates admin only when users empty`.
- [ ] **Step 2:** Write `e2e/auth.spec.ts`:
  - signed out, `/library` → `/login?next=%2Flibrary`;
  - signed out, `GET /api/songs/by-hash?h=x` → 401;
  - wrong password shows "Sai email hoặc mật khẩu";
  - correct login lands on `next`;
  - `/live` signed out returns 200;
  - a non-admin opening `/admin/users` is redirected to `/events`.
- [ ] **Step 3:** Run both. Expected: FAIL. **Step 4:** Implement. **Step 5:** Run. Expected: PASS.
- [ ] **Step 6:** Commit `feat(auth): argon2 sessions, login, user admin`.

### Task 5: Background playlist ordering

**Files:**
- Create: `src/lib/playback/background-order.ts`.
- Test: `tests/playback/background-order.test.ts`.

**Interfaces:**
- Produces:
  - `buildOrder(count, shuffle, rng, avoidFirst?): number[]`. It returns the identity
    when not shuffling. Otherwise it does a Fisher–Yates shuffle whose first element is
    not `avoidFirst` when `count > 1`.
  - `nextPosition(order, pos, shuffle, rng): { order; pos }`. It wraps to `pos 0`; when
    shuffling it builds a fresh order (`avoidFirst` = the last played index).

- [ ] **Step 1:** Write the tests:
  - `buildOrder(3,false)` equals `[0,1,2]`.
  - A shuffled order is a permutation.
  - Over 200 seeded runs, `buildOrder(3,true,rng,2)[0] !== 2`.
  - `nextPosition([0,1,2],2,false)` gives `{order:[0,1,2],pos:0}`.
  - count 1 gives `[0]`; count 0 gives `[]`.
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(playback): background ordering`.

### Task 6: Playback state machine

**Files:**
- Create: `src/lib/playback/machine.ts`.
- Test: `tests/playback/machine.test.ts` and `tests/playback/fixtures.ts`.

**Interfaces:**
- Consumes: Task 3 types; Task 5 functions.
- Produces:

```ts
export type Deck = 'bg0' | 'bg1' | 'cue0' | 'cue1';
export type Command =
  | { type: 'load'; deck: Deck; songId: string; atSec: number }   // set src + seek; gain stays 0
  | { type: 'play'; deck: Deck }
  | { type: 'ramp'; deck: Deck; to: number; seconds: number; pauseAtEnd?: boolean }
  | { type: 'master'; to: number };
export type Mode = 'idle' | 'background' | 'cue' | 'silent';
export interface PlaybackState {
  mode: Mode; currentCueIndex: number | null; playedCueIds: string[];
  bg: { order: number[]; pos: number; activeDeck: 'bg0' | 'bg1'; started: boolean; crossfading: boolean;
        fadingDeck: 'bg0' | 'bg1' | null; resumeAtSec: number | null };
  cue: { activeDeck: 'cue0' | 'cue1'; cueIndex: number | null; ending: boolean };
  master: number;
}
export type PlaybackEvent =
  | { type: 'START_BACKGROUND' } | { type: 'BACK_TO_BACKGROUND' }
  | { type: 'GO_CUE'; index: number } | { type: 'NEXT_CUE' } | { type: 'FADE_STOP' }
  | { type: 'CUE_TIME'; deck: Deck; t: number } | { type: 'CUE_ENDED'; deck: Deck }
  | { type: 'BG_TIME'; deck: Deck; t: number; duration: number } | { type: 'BG_ENDED'; deck: Deck }
  | { type: 'SET_MASTER'; to: number };
export function initialState(snap: ShowSnapshot, rng?: () => number): PlaybackState;
export function reduce(state: PlaybackState, ev: PlaybackEvent, snap: ShowSnapshot, rng?: () => number):
  { state: PlaybackState; commands: Command[] };
export function effectiveEnd(cue: Cue, song: Song): number;   // cue.endSec ?? song.durationSec
export function fadeIn(cue: Cue, s: EventSettings): number;   // cue.fadeInSec ?? s.cueFadeSec
export function fadeOut(cue: Cue, s: EventSettings): number;  // cue.fadeOutSec ?? s.cueFadeSec
```

**Rules** (spec §6.5):

- **Fade durations.**
  - Switching between a cue and the background uses the cue's fades.
  - Going back to the background from silence, or from a background-kind cue, uses
    `cueFadeSec`.
- **Target gains.** Background: `bgVolume`. Cue: `cue.volume / 100`.
- **Resuming the background.**
  - If `bg.started`: `play` the active bg deck, then `ramp` it. No `load`.
  - Otherwise: `load` it with `background[order[pos]]` at `bg.resumeAtSec ?? 0`, then
    `play`, then `ramp`. Then set `started = true` and `resumeAtSec = null`.
  - If the background playlist is empty, the result is `silent` with no commands.
- **Background crossfade.**
  - It starts on `BG_TIME` with `t >= duration - bgCrossfadeSec`, or on `BG_ENDED` of
    the active deck.
  - It loads the next track on the other deck, then plays it, ramps it in, and ramps the
    old deck out with `pauseAtEnd`.
  - `crossfading` and `fadingDeck` are cleared on the first `BG_TIME` of the new deck
    with `t >= bgCrossfadeSec`, or when a cue or FADE_STOP fades out both bg decks.
- **Stale events are ignored.**
  - `CUE_TIME` / `CUE_ENDED` from a non-active cue deck, or after `cue.ending`.
  - `BG_TIME` from a non-active bg deck, or when `mode !== 'background'`.
- **`NEXT_CUE`**: `index = currentCueIndex === null ? 0 : currentCueIndex + 1`. Past the
  end, it is a no-op.
- **`SET_MASTER`**: clamps to 0–1.

**Fixture**:
- `DEFAULT_SETTINGS`.
- Songs:

  | Song | Duration |
  |---|---|
  | `b1` | 200 s |
  | `b2` | 180 s |
  | `c1` | 190 s |

- `background ['b1','b2']`.
- Cues:

  | Index | Kind | Name | Song | Start / end | Other fields |
  |---|---|---|---|---|---|
  | 0 | background | "Đón khách" | — | — | — |
  | 1 | song | "Cô dâu chú rể vào" | `c1` | `startSec 45` | `onEnd 'resume_background'` |
  | 2 | song | "Cảm ơn bố mẹ" | `c1` | `startSec 0`, `endSec 60` | `fadeOutSec 5`, `onEnd 'stop'` |

- Helper `run(events, init?)` folds `reduce` over the events.

- [ ] **Step 1: Write the failing tests:**

| Test | Assertion |
|---|---|
| `START_BACKGROUND from idle loads and fades in b1` | `[load bg0 b1 0, play bg0, ramp bg0→0.7/3]`; mode `background` |
| `GO_CUE song fades bg out and cue in` | contains `ramp bg0→0/3 pauseAtEnd`, `load cue0 c1 45`, `play cue0`, `ramp cue0→1/3`; mode `cue`; currentCueIndex 1; playedCueIds has cue 1 |
| `GO_CUE from cue to cue uses the other cue deck` | GO_CUE 1, GO_CUE 2 → `ramp cue0→0/3 pauseAtEnd`, `load cue1 c1 0`; activeDeck `cue1` |
| `cue reaching end minus fadeOut resumes background without reload` | START_BACKGROUND, GO_CUE 1, CUE_TIME cue0 187 → `[ramp cue0→0/3 pauseAtEnd, play bg0, ramp bg0→0.7/3]`, no bg `load`; mode `background` |
| `second CUE_TIME after ending emits nothing` | then CUE_TIME cue0 188 → `[]` |
| `onEnd stop goes silent` | GO_CUE 2, CUE_TIME cue0 55 → `[ramp cue0→0/5 pauseAtEnd]`; mode `silent` |
| `CUE_ENDED before fade point still transitions` | START_BACKGROUND, GO_CUE 1, CUE_ENDED cue0 → bg play+ramp; mode `background` |
| `background-kind cue acts as back-to-background and marks current` | START_BACKGROUND, GO_CUE 1, GO_CUE 0 → bg play+ramp; currentCueIndex 0 |
| `NEXT_CUE from null goes to 0; past end is no-op` | NEXT_CUE → index 0; GO_CUE 2, NEXT_CUE → `[]`, state unchanged |
| `FADE_STOP ramps audible decks to 0 over stopFadeSec` | in cue mode → `ramp cue0→0/3 pauseAtEnd`; mode `silent` |
| `background crossfade at duration minus 4s` | START_BACKGROUND, BG_TIME bg0 196/200 → `[load bg1 b2 0, play bg1, ramp bg1→0.7/4, ramp bg0→0/4 pauseAtEnd]`; activeDeck `bg1` |
| `background wraps to first track` | then BG_TIME bg1 176/180 → `load bg0 b1 0` |
| `BG_ENDED before crossfade point still advances` | START_BACKGROUND, BG_ENDED bg0 → `load bg1 b2 0`, `play bg1`, `ramp bg1→0.7/4` |
| `GO_CUE during background crossfade fades both bg decks; resume plays only incoming` | START_BACKGROUND, BG_TIME bg0 196/200, GO_CUE 1 → ramps bg0 and bg1 → 0 pauseAtEnd; BACK_TO_BACKGROUND → `play bg1` only |
| `restored resumeAtSec is used once` | init with `bg.resumeAtSec 83`, START_BACKGROUND → `load bg0 b1 83`; then `resumeAtSec === null` |
| `rapid GO_CUE presses never emit a sub-0.1s ramp` | GO_CUE 1, 2, 1 → every ramp `seconds >= 0.1`; activeDeck alternates cue0→cue1→cue0 |
| `empty background: resume goes silent` | `background: []`, GO_CUE 1, CUE_TIME cue0 187 → mode `silent`, no bg commands |
| `stale CUE_TIME from inactive deck ignored` | GO_CUE 1, GO_CUE 2, CUE_TIME cue0 187 → `[]` |
| `SET_MASTER clamps` | 1.4 → `master 1` |

- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run. Expected: all PASS.
- [ ] **Step 5:** Commit `feat(playback): pure playback state machine`.

### Task 7: Web Audio driver

**Files:**
- Create: `src/lib/playback/audio-driver.ts`.
- Test: `tests/playback/audio-driver.test.ts` (with fake `AudioContext`, `GainNode`,
  `AudioParam` and `HTMLAudioElement`).

**Interfaces:**
- Consumes: Task 6 types.
- Produces:

```ts
export interface AudioDriver {
  run(commands: Command[]): void;
  onEvent(cb: (ev: PlaybackEvent) => void): () => void;   // CUE_TIME/CUE_ENDED/BG_TIME/BG_ENDED
  deckInfo(deck: Deck): { songId: string | null; t: number; duration: number; paused: boolean };
  dispose(): void;
}
export function createAudioDriver(ctx: AudioContext, resolveUrl: (songId: string) => string): AudioDriver;
```

**Behavior:**
- Each deck is chained: element → `MediaElementAudioSourceNode` → `GainNode` (starts at
  0) → master gain → destination.
- **`load`**: set `src`, and set `currentTime = atSec` on `loadedmetadata`. A `play`
  issued before the metadata arrives waits for it.
- **`ramp`**, in this order:
  1. `cancelScheduledValues(now)`
  2. `setValueAtTime(param.value, now)`
  3. `linearRampToValueAtTime(to, now + seconds)`

  With `pauseAtEnd`, it pauses the deck after `seconds*1000+50` ms. A later ramp on the
  same deck clears that timer.
- **`master`**: ramps the master gain over 0.2 s.
- `timeupdate` and `ended` are forwarded as `CUE_*` or `BG_*` events, depending on the
  deck.

- [ ] **Step 1:** Write the tests:
  - `ramp starts from current value`: with param value 0.4, the calls are `cancelScheduledValues(now)`, `setValueAtTime(0.4, now)`, then `linearRampToValueAtTime(1, now+3)`.
  - `pauseAtEnd pauses after ramp and is cancelled by a newer ramp` (fake timers).
  - `play before metadata waits`.
  - `timeupdate on cue0 emits CUE_TIME cue0`.
  - `ended on bg1 emits BG_ENDED`.
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(playback): web audio driver`.

### Task 8: Music store and file API

**Files:**
- Create: `src/server/music/store.ts`.
- Create: `src/app/api/songs/upload/route.ts`, `src/app/api/songs/by-hash/route.ts` and
  `src/app/api/songs/[id]/file/route.ts`.
- Create: `src/lib/library/hash.ts`.
- Create: `scripts/make-fixtures.ts`. It writes to `e2e/fixtures/`:
  - `tone-a-20s.wav` (440 Hz)
  - `tone-b-20s.wav` (660 Hz)
  - `tone-c-30s.wav` (880 Hz)
  - `garbage.mp3` (random bytes)

  All tones are 16-bit mono at 22.05 kHz.
- Test: `tests/server/music-store.test.ts` and `tests/server/file-route.test.ts` (each
  uses a temp `DATA_DIR` and an in-memory DB).

**Interfaces:**
- Consumes: `getDb`/`createTestDb` (Task 2) and `requireUserApi` (Task 4).
- Produces (server):

```ts
export const ALLOWED = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav' } as const;
titleFromFilename(name: string): string;               // strip ext, NFC, trim
musicPath(fileName: string): string;                   // path.join(DATA_DIR,'music',fileName); rejects '..' or '/'
storeUpload(db, input: { body: ReadableStream<Uint8Array>; originalName: string; folderId: string | null;
  maxBytes: number }): Promise<Song>;
  // streams to `${DATA_DIR}/music/.tmp-<uuid>` computing sha256 + byte count; aborts > maxBytes;
  // parseFile (music-metadata) → title/artist/duration (title fallback titleFromFilename); no duration → 'unreadable';
  // rename to `<id>.<ext>`; insert row (incl. search_text); on any failure unlink tmp/final and throw UploadError(reason)
export class UploadError extends Error { reason: 'unsupported_type' | 'too_large' | 'unreadable' }
replaceSongFile(db, songId, input): Promise<Song>;     // same pipeline, keeps id, removes old file if ext changed
deleteSongFile(fileName: string): Promise<void>;
```

- Routes (all start with `requireUserApi`):
  - `PUT /api/songs/upload?name=<encoded>&folderId=<id|>`: raw request body. Returns
    `201 Song`, or `400 {reason}` / `413 {reason:'too_large'}`. It also checks
    `content-length` up front.
  - `GET /api/songs/by-hash?h=<hex>`: returns `{ song: Song | null }`.
  - `GET /api/songs/[id]/file`: streams the file with `Content-Type`,
    `Accept-Ranges: bytes`, and `206` on a `Range` request. Unknown id → 404.
  - `PUT /api/songs/[id]/file?name=<encoded>`: replaces the file through
    `replaceSongFile`. Same responses as upload.
- Produces (client, `src/lib/library/hash.ts`):
  - `sha256Hex(blob: Blob): Promise<string>`;
  - `uploadFile(file: File, folderId: string | null, onProgress: (f: number) => void): Promise<Song>`,
    which uses XHR `PUT` for progress.

- [ ] **Step 1:** Write the tests:
  - `falls back to filename when tags empty`: `"Đám Cưới Nhé.wav"` with NFD input gives the NFC title `"Đám Cưới Nhé"`.
  - `stored file name is ascii`: matches `/^[0-9a-f-]{36}\.wav$/`.
  - `rejects .flac as unsupported_type`.
  - `rejects oversize and deletes temp file`: `maxBytes` 1000 with a fixture → `too_large`, and the `music/` dir has no `.tmp-*`.
  - `rejects unreadable audio`: `garbage.mp3` → `unreadable`, and no file is left.
  - `content hash equals sha256 of bytes`.
  - `musicPath rejects traversal`.
  - `replaceSongFile keeps id, updates hash, and removes old file when ext changes`.
  - `file route returns 206 with correct Content-Range for bytes=0-99`.
  - `file route 401 without session`.
  - `sha256Hex("abc")` starts with `ba7816bf`.
- [ ] **Step 2:** Run `npm run fixtures`, then run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement. **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(library): streaming upload, metadata and file api`.

### Task 9: Library page (Kho nhạc)

**Files:**
- Create: `src/server/repo/songs.ts` and `src/server/repo/folders.ts`.
- Create: `src/app/library/page.tsx`, `src/app/library/actions.ts` and
  `src/app/library/components/` (`FolderTree`, `SongTable`, `UploadDropzone`,
  `SongActions`, `UsageBar`).
- Test: `tests/server/repo-songs.test.ts` and `e2e/library.spec.ts`.

**Interfaces:**
- Consumes: Task 8 (`storeUpload`, `replaceSongFile`, `deleteSongFile`, `uploadFile`,
  `sha256Hex`).
- Produces (repo; every function takes `db` first):

```ts
listSongs(db, opts?: { folderId?: string | null; search?: string }): Song[]   // LIKE on title/artist, case-insensitive
updateSong(db, id, patch: Partial<Pick<Song,'title'|'artist'|'folderId'>>): Song
songUsage(db, songId): { eventId: string; eventName: string }[]
deleteSong(db, id): Promise<void>        // throws SongInUseError(usage); deletes row then file
listFolders(db): Folder[]; createFolder(db, name, parentId): Folder; renameFolder; moveFolder (rejects cycles);
deleteFolder(db, id)                     // throws FolderNotEmptyError
libraryUsage(db): { musicBytes: number; diskFreeBytes: number }   // fs.statfs(DATA_DIR)
```

- Server Actions wrap these functions behind `requireUser()` and `revalidatePath('/library')`.
- UI copy:

  | Element | Copy |
  |---|---|
  | Page title | "Kho nhạc" |
  | Buttons | "Tải nhạc lên", "Thư mục mới" |
  | Search placeholder | "Tìm theo tên bài hoặc nghệ sĩ" |
  | Duplicate dialog | "Bài này đã có trong kho", with "Bỏ qua" / "Vẫn thêm" |
  | Delete blocked | "Không thể xoá vì bài đang được dùng", plus the event names |
  | Delete confirm | "Xoá bài này? Không thể hoàn tác." |
  | Usage | "Nhạc: X GB · Đĩa còn trống: Y GB" |
  | Per-file failure | "Thử lại" |

- The dropzone accepts folders through `webkitGetAsEntry`.

- [ ] **Step 1:** Write the unit tests:
  - `deleteSong throws SongInUseError listing event names`.
  - `deleteSong removes file from disk`.
  - `moveFolder rejects moving into own descendant`.
  - `deleteFolder throws when not empty`.
  - `listSongs search is case-insensitive for Vietnamese` ("đám" matches "Đám"). This
    uses `search_text` (Task 2); `updateSong` must refresh it.
- [ ] **Step 2:** Write `e2e/library.spec.ts`:
  - upload 3 fixtures and see 3 rows;
  - re-upload `tone-a` and see "Bài này đã có trong kho";
  - uploading `garbage.mp3` shows a per-file error row;
  - a renamed title persists after reload;
  - create a folder, move a song into it, filter by it → 1 row;
  - search "tone-b" → 1 row;
  - delete with confirm → the row is gone.
- [ ] **Step 3:** Run both. Expected: FAIL. **Step 4:** Implement. **Step 5:** Run. Expected: PASS.
- [ ] **Step 6:** Commit `feat(library): music library ui`.

### Task 10: Events list and editor

**Files:**
- Create: `src/server/repo/events.ts`.
- Create: `src/app/events/page.tsx`, `src/app/events/actions.ts` and
  `src/app/events/[id]/page.tsx`.
- Create `src/app/events/[id]/components/`: `BackgroundList`, `CueList`, `CueEditor`,
  `TimePicker`, `SettingsPanel`, `SaveIndicator` and `useAutosave.ts`.
- Test: `tests/server/repo-events.test.ts`, `tests/events/useAutosave.test.ts` and
  `e2e/editor.spec.ts`.

**Interfaces:**
- Consumes: `cueSchema` and `parseSettings` (Task 3); `listSongs` (Task 9).
- Produces:

```ts
listEvents(db): EventRecord[]; createEvent(db, name): EventRecord; renameEvent(db, id, name);
updateSettings(db, id, s: EventSettings); deleteEvent(db, id);
duplicateEvent(db, id, newName): EventRecord;        // one transaction: event + background_tracks + cues
getEventDetail(db, id): EventDetail | null;
addBackgroundTrack(db, eventId, songId); removeBackgroundTrack(db, trackId);
reorderBackground(db, eventId, ids: string[]); upsertCue(db, eventId, cue: Cue); deleteCue(db, cueId);
reorderCues(db, eventId, ids: string[]);              // one transaction; positions = array index
export function useAutosave<T>(value: T, save: (v: T) => Promise<void>, delayMs = 800):
  { status: 'saved' | 'saving' | 'error'; retry: () => void };
```

- Every mutation bumps `events.updated_at`.
- UI:
  - **Events list** ("Chương trình"): "Tạo chương trình", "Nhân bản", "Xoá" (with
    confirm), plus a link to "Kiểm tra & nạp".
  - **Editor panels**: "Nhạc nền", "Kịch bản", "Cài đặt". Reordering uses dnd-kit.
  - **Cue fields**: labels from spec §6.4.
  - **`TimePicker`**: a seek bar plus "Nghe thử từ điểm này" and "Lấy vị trí đang nghe".
    Preview plays from `<audio src="/api/songs/<id>/file">`.
  - **Save indicator**: "Đã lưu" / "Đang lưu…" / "Lỗi lưu, thử lại".

- [ ] **Step 1:** Write the tests:
  - `duplicateEvent copies cues and background in order`.
  - `reorderCues sets positions to array index`.
  - `upsertCue rejects invalid cue via cueSchema`.
  - `useAutosave debounces 800ms saving→saved` (fake timers).
  - `useAutosave error then retry calls save again`.
- [ ] **Step 2:** Write `e2e/editor.spec.ts`:
  - create "Đám cưới Test";
  - add 2 background tracks, reorder them, reload → the order persists;
  - add the background cue "Đón khách";
  - add the song cue "Cô dâu chú rể vào" with tone-c at 0:05, "Dừng";
  - reload → it persists;
  - a song cue with no song shows a validation message;
  - set "Chuyển tiết mục" fade to 5 in "Cài đặt", reload → it persists;
  - duplicate → the copy has 2 cues.
- [ ] **Step 3:** Run. Expected: FAIL. **Step 4:** Implement. **Step 5:** Run. Expected: PASS.
- [ ] **Step 6:** Commit `feat(events): event list and script editor with autosave`.

### Task 11: Event JSON export and import

**Files:**
- Create: `src/lib/events/export.ts`.
- Modify: `src/app/events/page.tsx` (add "Xuất JSON" and "Nhập JSON") and
  `src/app/events/actions.ts`.
- Test: `tests/events/export.test.ts`.

**Interfaces:**
- Consumes: `getEventDetail`, `createEvent`, `upsertCue`, `addBackgroundTrack` and
  `updateSettings` (Task 10).
- Produces:

```ts
export interface EventExportV1 { version: 1; name: string; settings: EventSettings;
  songs: { ref: string; title: string; contentHash: string }[];
  background: string[]; /* refs */ cues: (Omit<Cue, 'id' | 'songId'> & { songRef: string | null })[] }
export function toExport(detail: EventDetail): EventExportV1;
export function parseExport(json: unknown): EventExportV1;   // zod; error message "File không đúng định dạng"
export function importEvent(db, data: EventExportV1): { event: EventRecord; missing: { title: string; contentHash: string }[] };
```

- Import matches songs by `contentHash`.
  - A missing background song is skipped.
  - A song cue with a missing song becomes `kind 'background'`, and its name gets the
    suffix " (thiếu bài)".
  - Each missing song is listed in `missing`.

- [ ] **Step 1:** Write the tests:
  - `round-trips through toExport/parseExport`.
  - `parseExport rejects version 2`.
  - `importEvent converts cue with missing song to background and reports it`.
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(events): json export/import`.

### Task 12: Snapshot, music cache and the Load page

**Files:**
- Create: `src/app/api/events/[id]/snapshot/route.ts`.
- Create: `src/lib/offline/snapshot.ts` and `src/lib/offline/music-cache.ts`.
- Create: `src/app/events/[id]/load/page.tsx`.
- Test: `tests/offline/snapshot.test.ts` and `tests/offline/music-cache.test.ts` (with an
  in-memory fake `CacheStorage`).

**Interfaces:**
- Consumes: `getEventDetail` (Task 10).
- Produces:

```ts
// GET /api/events/[id]/snapshot → ShowSnapshot (requireUserApi)
export function buildSnapshot(detail: EventDetail, now: Date): ShowSnapshot;   // only referenced songs, cues by position
export const SNAPSHOT_KEY = 'sb:snapshot';
export function saveSnapshot(s: ShowSnapshot): void; export function readSnapshot(): ShowSnapshot | null;
export const MUSIC_CACHE = 'sb-music-v1';
export function cacheKey(song: Song): string;              // `/__music/${song.id}?h=${song.contentHash}`
export async function getCachedBlob(song: Song, caches: CacheStorage): Promise<Blob | null>;
export type LoadItem = { songId: string; title: string; status: 'pending'|'downloading'|'ok'|'error'; reason?: string };
export function validateCueTimes(snap: ShowSnapshot): { cueId: string; reason: string }[];
export async function loadShow(snap: ShowSnapshot, deps: { caches: CacheStorage; fetch: typeof fetch;
  probe: (blob: Blob) => Promise<number>;
  onProgress: (items: LoadItem[], bytesDone: number, bytesTotal: number) => void }):
  Promise<{ ok: boolean; items: LoadItem[]; cueErrors: { cueId: string; reason: string }[] }>;
  // fetches `/api/songs/${id}/file`; concurrency 3; 2 retries
export async function pruneMusicCache(keep: Song[], caches: CacheStorage): Promise<number>;
```

- Error copy:
  - "Không tải được bài (lỗi mạng)"
  - "File không phát được"
  - "Giây bắt đầu vượt quá độ dài bài"
  - "Giây kết thúc vượt quá độ dài bài"
- Load page:
  - shows progress as `x/y bài` and MB, plus a list of errors;
  - shows the badge "Sẵn sàng offline" when `ok`, the snapshot is saved, and
    `navigator.serviceWorker.controller` is set;
  - calls `navigator.storage.persist()`, and `pruneMusicCache` after `ok`;
  - "Bắt đầu tiệc" is disabled until `ok`, then goes to `/live`;
  - "Thử chế độ offline" opens a dialog that tells the user to turn off Wi-Fi and reload
    `/live`.

- [ ] **Step 1:** Write the tests:
  - `buildSnapshot includes only referenced songs and keeps cue order`.
  - `cached song with same hash is not re-downloaded` (fetch spy is called 0 times).
  - `changed hash re-downloads`.
  - `rejects startSec beyond duration`: a 30 s song with cue `startSec` 40 → "Giây bắt đầu vượt quá độ dài bài", and `ok === false`.
  - `fetch failing 3 times yields error item and ok=false`.
  - `background-kind cue without song is not an error`.
  - `pruneMusicCache removes keys for songs not kept`.
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(offline): snapshot, music cache and load page`.

### Task 13: Service worker and offline `/live` shell

**Files:**
- Create: `src/app/sw.ts`, `public/manifest.webmanifest` and the icons.
- Modify: `next.config.ts` (`withSerwist({ swSrc: 'src/app/sw.ts', swDest: 'public/sw.js' })`).
- Create: `src/app/live/page.tsx`. It is a `'use client'` page that renders
  `readSnapshot()?.eventName`, or "Chưa nạp chương trình nào".
- Test: `e2e/offline.spec.ts`.

**Interfaces:**
- Produces:
  - The SW precaches the build assets plus `/live` (`additionalPrecacheEntries`,
    revision = build id).
  - A navigation to `/live` is served from the precache.
  - `/__music/*` is not routed by the SW.
  - `/live` makes no server calls.

- [ ] **Step 1:** Write `e2e/offline.spec.ts`:
  - log in, create an event that uses the 3 tone fixtures, and open Load;
  - wait for "Sẵn sàng offline";
  - `context.setOffline(true)`, then `goto('/live')` → the event name is visible;
  - record every request: none hit `/api/`;
  - in the page, `caches.open('sb-music-v1')` has 3 keys.
- [ ] **Step 2:** Run against the production build. Expected: FAIL.
- [ ] **Step 3:** Implement. **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(pwa): serwist service worker with offline live route`.

### Task 14: Live screen

**Files:**
- Create: `src/lib/offline/live-persist.ts`.
- Create `src/app/live/components/`: `NowPlaying`, `CueColumn`, `BackgroundPanel`,
  `ControlBar`, `useLiveEngine.ts`, `useShortcuts.ts`, `useWakeLock.ts`.
- Modify: `src/app/live/page.tsx`.
- Test: `tests/live/useShortcuts.test.tsx`, `tests/live/live-persist.test.ts` and
  `tests/live/useLiveEngine.test.tsx` (with a mocked driver).

**Interfaces:**
- Consumes:
  - Task 12: `readSnapshot`, `getCachedBlob`.
  - Task 6: `initialState`, `reduce`.
  - Task 7: `createAudioDriver`.
- Produces:

```ts
export const LIVE_KEY = (eventId: string) => `sb:live:${eventId}`;
export interface LivePersisted { currentCueIndex: number | null; playedCueIds: string[]; bgOrder: number[]; bgPos: number; bgPositionSec: number; savedAt: string }
export function saveLive(eventId: string, p: LivePersisted): void; export function readLive(eventId: string): LivePersisted | null;
export function restoreState(snap: ShowSnapshot, p: LivePersisted): PlaybackState;   // mode 'silent', bg.started false, bg.resumeAtSec = p.bgPositionSec
export function useShortcuts(h: { next(): void; background(): void; fadeStop(): void; volume(delta: number): void }): void;
export function useLiveEngine(snap: ShowSnapshot): { state: PlaybackState; dispatch(ev: PlaybackEvent): void;
  deckInfo: AudioDriver['deckInfo']; ready: boolean; error: string | null; start(): Promise<void> };
```

**Behavior:**
- **Start-up**
  - The engine builds object URLs from `getCachedBlob` for every snapshot song before
    `ready`. If one is missing, it shows "Thiếu nhạc trong bộ nhớ — quay lại Kiểm tra &
    nạp".
  - An overlay "Bấm để bắt đầu điều khiển" creates the `AudioContext` (autoplay policy).
- **Persistence**
  - Save every 5 s and on every cue change.
  - On load, if `readLive` finds a saved state, offer "Tiếp tục từ chỗ cũ" / "Bắt đầu
    lại". "Tiếp tục" uses `restoreState`, then "Phát nhạc nền" → START_BACKGROUND, which
    resumes at the saved position.
- **Shortcuts**
  - Shortcuts are ignored inside inputs.
  - Space does nothing.
  - Arrows send `SET_MASTER` ±0.05.
- **Leaving the page**
  - `beforeunload` prompts while `mode !== 'idle'`.
  - "Thoát chế độ Live" asks to confirm, then goes to `/events`.
- **Wake lock**: request `navigator.wakeLock.request('screen')` on start, and again on
  `visibilitychange`.
- **Layout** (spec §6.6):
  - big buttons "▶ TIẾT MỤC TIẾP: <tên>", "Về nhạc nền", "Fade out & dừng";
  - the banner "ĐANG IM LẶNG" while silent;
  - each cue row shows ✓ / ▶ and a `[Dừng]` tag;
  - the current or next cue's note;
  - remaining time with "→ hết bài: phát tiếp nhạc nền" / "→ hết bài: dừng";
  - each `<audio>` gets a `data-deck` attribute.

- [ ] **Step 1:** Write the tests:
  - `N→next, B→background, F→fadeStop, ArrowUp→volume(+0.05)`.
  - `Space calls nothing`.
  - `keys ignored inside input`.
  - `saveLive/readLive round-trip`.
  - `restoreState marks played cues, mode silent, resumeAtSec = bgPositionSec`.
  - `dispatch forwards reducer commands to driver.run` (GO_CUE 1 → `load cue0`).
  - `missing cached blob sets error, not ready`.
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Extend `e2e/offline.spec.ts` (offline throughout):
  - click the overlay, press `N` → "Đón khách" is current;
  - press `N` → "Cô dâu chú rể vào" is current, and `audio[data-deck=cue0]` has a `blob:` src;
  - press `F` → "ĐANG IM LẶNG" appears within 4 s.
- [ ] **Step 6:** Run. Expected: PASS.
- [ ] **Step 7:** Commit `feat(live): live control screen`.

### Task 15: Backup

**Files:**
- Create: `src/app/api/admin/backup/route.ts`.
- Modify: `src/app/admin/users/page.tsx` (add the "Tải bản sao lưu database" button).
- Test: `tests/server/backup.test.ts`.

**Interfaces:**
- Produces:
  - `backupDatabase(db, destPath: string): void`, which runs `VACUUM INTO`.
  - `GET /api/admin/backup` (`requireAdmin`) streams
    `soundboard-YYYY-MM-DD-HHmm.db`, then deletes the temp file.

- [ ] **Step 1:** Write the tests:
  - `backup file opens and contains same row counts`.
  - `non-admin gets 403`.
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(admin): database backup download`.

### Task 16: Docker deployment and docs

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `Caddyfile`.
- Modify: `README.md` (Vietnamese).
- Create: `docs/manual-test.md`.

**Interfaces:**
- `Dockerfile`:
  - Multi-stage on `node:24-slim`: `deps` → `build` → `run`.
  - The `run` stage copies `.next/standalone`, `.next/static`, `public` and `drizzle/`.
  - It runs as user `node`, with `ENV DATA_DIR=/data`, `EXPOSE 3000` and
    `CMD ["node","server.js"]`.
  - It also ships `scripts/create-user` as compiled JS.
- `docker-compose.yml`:
  - `app` uses the named volume `soundboard-data:/data` and reads
    `ADMIN_EMAIL`/`ADMIN_PASSWORD` from `.env`; `restart: unless-stopped`.
  - `caddy` uses `caddy:2` with ports 80/443, the `Caddyfile`, and `caddy-data`/
    `caddy-config` volumes.
- `Caddyfile`: `{$DOMAIN} { reverse_proxy app:3000 }`, plus
  `request_body { max_size 200MB }`.
- The README covers:
  - Dev: `npm install`, `.env.local`, `npm run dev`. No Docker needed.
  - Deploy: a VPS or a machine with Docker and a domain pointing to it;
    `docker compose up -d --build`; creating users with
    `docker compose exec app node scripts/create-user.js …`.
  - The HTTPS requirement for offline mode.
  - Updating with `git pull && docker compose up -d --build` (data persists).
  - Backups: the admin download button, or copy the volume, which needs both `app.db` and
    `music/`.
  - A day-of checklist:
    1. Load the show.
    2. Wait for "Sẵn sàng offline".
    3. Run the offline test.
    4. Plug in the speaker.
    5. Turn off sleep.
- `docs/manual-test.md` records:
  - listening on real speakers;
  - a cue starting at 0:45;
  - "Dừng" ends in silence;
  - "phát tiếp" resumes the background at the same spot;
  - Wi-Fi off + reload + "Tiếp tục từ chỗ cũ";
  - restarting the container keeps data.

- [ ] **Step 1:** Write the files.
- [ ] **Step 2:** Verify locally without Docker:
  1. Run `npm run build`.
  2. Copy `.next/static` and `public` into `.next/standalone`.
  3. Run `DATA_DIR=./tmp-standalone node .next/standalone/server.js`.
  4. Log in as the env admin; uploading a fixture works.
- [ ] **Step 3:** Run `npm test && npm run test:e2e`. Expected: all green.
- [ ] **Step 4:** On the deploy host or in CI, run `docker compose build` and `docker compose up -d`. Then `docker compose restart app`, and the data is still there. Record the result in `docs/manual-test.md`.
- [ ] **Step 5:** Commit `chore(deploy): dockerfile, compose with caddy, readme`.
