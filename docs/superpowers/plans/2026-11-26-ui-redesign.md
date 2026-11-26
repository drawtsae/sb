# UI Redesign + Per-Cue Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the whole app a dark-purple/gold "Wedding Soundboard" look (sidebar shell, card
layout, restyled Live screen) and add a per-cue transition mode: *Crossfade* or *Fade out → In*.

**Architecture:**
- Visual work is token-first: the palette lives in `globals.css` under the existing shadcn token
  names, so current components recolour without edits. Then a shared `AppShell` replaces
  `AppHeader`, and each page is restyled in place. Behaviour, saving and loading stay as they are.
- The transition feature runs through the existing layers in order: DB column → types/validation →
  export/snapshot → pure machine (`delaySec` on `play`/`ramp`) → Web Audio driver (one delay timer
  per deck) → editor and Live UI.

**Tech Stack:** Next.js 16.4.6 (App Router), Tailwind v4 + shadcn (base-ui), lucide-react 1.80.0,
`next/font/google`, Drizzle + better-sqlite3, Zod 4, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-26-ui-redesign-design.md`. Every constraint in
`docs/superpowers/specs/2026-11-25-wedding-soundboard-design.md` still holds.

## Global Constraints

**Read first:** `AGENTS.md`. Next 16 differs from your training data. Read the guide in
`node_modules/next/dist/docs/` before using a Next API, for example `next/font`.

**Colours.** Token values, used verbatim:

| Token | Value |
|---|---|
| background | `#0E0A1A` |
| card | `#171128` |
| `--surface-2` | `#1F1836` |
| border | `#2E2550` |
| foreground | `#F1EDFF` |
| muted-foreground | `#A79FC4` |
| primary | `#8B5CF6`, with `#FFFFFF` on it |
| accent (gold) | `#F5C451`, with `#1A1408` on it |
| success | `#22C55E` |
| destructive | `#F87171`, on `#3A1A22` |

- Components use tokens, not raw hex.
- Text/background pairs must reach at least 4.5:1 contrast.

**Visual rules**
- Font: Be Vietnam Pro via `next/font/google`, subsets `vietnamese` and `latin`, weights 400/500/600/700. Remove Geist.
- Every time readout uses `tabular-nums`.
- Icons come from `lucide-react` only. No emoji.
- Radius: cards 16px; buttons and inputs 10px.
- Shadows are soft. No neon glow.
- Transitions take 150–200 ms and respect `prefers-reduced-motion`.
- Focus rings are visible.
- Hit targets are at least 44×44 px.

**Keep these unchanged, or update the test in the same commit:**
- every `data-testid`;
- every Vietnamese label;
- every ARIA role/name used by `e2e/*.spec.ts` and `tests/**`.

Before editing a component, run `grep -rn "<label or testid>" e2e tests`. Logout stays a
`button` named "Đăng xuất".

**`/live`**
- No lazy-loaded chunks: no `next/dynamic`, no `React.lazy`.
- No links that need the network.
- No sidebar.

**Out of scope:**
- SFX;
- cover art;
- an "Instant" transition;
- instant "Stop All";
- "Pause All";
- window chrome buttons.

**Transition values and copy**
- Values: `'crossfade' | 'fade_out_in'`. A cue's `null` means "use the event default".
- Display copy:
  - "Kiểu chuyển";
  - "Kiểu chuyển mặc định";
  - options "Theo cài đặt chung", "Crossfade", "Fade out → In".

**Done when** `npm test` and `npm run test:e2e` are green at the end of every task. Run
`npx tsc --noEmit` and `npm run lint` too.

**Branch:** `feature/ui-redesign`, cut from `main`. Commit each task with the
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` trailer.

## Review Focus

1. **A Live snapshot saved before this change is resumed.** Its cues have no `transition` and its settings have no `defaultTransition`. It must behave as Crossfade and never crash. → Task 2 (`resolveTransition` legacy test) and Task 6 (label test with legacy objects).
2. **N, B or F is pressed during the silent wait of a Fade out → In.** The pending delayed `play`/`ramp` on that deck must never fire, so no deck becomes audible without the machine knowing. → Task 2 (machine re-press test) and Task 3 (driver cancel tests).
3. **Fade out → In with nothing audible.** This covers start from idle, after "Fade out & dừng", and after a cue that ended with "dừng". There is no wait: the new cue fades in at once. → Task 2 test.
4. **A JSON export made before this change is imported.** It has no `transition` and no `defaultTransition`. Import succeeds, with `null` and `'crossfade'`, and a new export round-trips both fields. → Task 1 tests.
5. **A narrow editor window (<1024 px).** The sidebar becomes a top bar with a menu button. The button toggles the nav, every nav item can still be reached, and the page never scrolls sideways. → Task 4 component test plus the Task 8 screenshot at 768 px.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/types.ts` | `Transition` type, `Cue.transition`, `EventSettings.defaultTransition` |
| `src/lib/validation.ts` | `transitionSchema`, cue/settings schemas |
| `src/server/db/schema.ts`, `drizzle/0003_*.sql` | `cues.transition` column + CHECK |
| `src/server/repo/events.ts` | row ↔ cue mapping |
| `src/lib/events/export.ts` | export/import of the new fields |
| `src/lib/playback/machine.ts` | `resolveTransition`, delayed incoming commands |
| `src/lib/playback/audio-driver.ts` | executes `delaySec` |
| `src/app/globals.css`, `src/app/layout.tsx` | tokens, font |
| `src/components/app-shell.tsx` (new, replaces `app-header.tsx`) | sidebar / narrow top bar |
| `src/components/brand-logo.tsx` (new) | rings SVG + wordmark |
| `src/components/offline-status.tsx` (new) | "Sẵn sàng offline" pill |
| `src/app/events/[id]/components/*` | editor restyle + transition fields |
| `src/app/live/**` | Live restyle + transition labels |
| `src/app/live/components/transition-label.ts` (new) | pure label helper |
| events list, load, library, login, admin pages | restyle only |
| `e2e/screens.spec.ts` (new) | screenshot pass |

---

### Task 1: Transition data layer

**Files:**
- Modify: `src/lib/types.ts`, `src/lib/validation.ts`, `src/server/db/schema.ts`, `src/server/repo/events.ts`, `src/lib/events/export.ts`
- Create: `drizzle/0003_<generated>.sql` (generated by drizzle-kit)
- Test: `tests/lib/validation.test.ts`, `tests/server/repo-events.test.ts`, `tests/events/export.test.ts`, `tests/offline/snapshot.test.ts`

**Interfaces:**
- Produces:
  - `export type Transition = 'crossfade' | 'fade_out_in'` (types.ts);
  - `Cue.transition: Transition | null`;
  - `EventSettings.defaultTransition: Transition`;
  - `DEFAULT_SETTINGS.defaultTransition = 'crossfade'`;
  - `export const transitionSchema = z.enum(['crossfade','fade_out_in'])` (validation.ts);
  - `cueSchema.transition = transitionSchema.nullable().default(null)`;
  - `settingsSchema.defaultTransition = transitionSchema`.

- [ ] **Step 1: Write the failing tests**
  - `validation.test.ts`:
    - `parseSettings({})` → `defaultTransition: 'crossfade'`.
    - `parseSettings({ defaultTransition: 'instant' })` → `'crossfade'`.
    - `parseSettings({ defaultTransition: 'fade_out_in' })` → `'fade_out_in'`.
    - `cueSchema.parse({...validCue})` without the field → `transition === null`.
    - `cueSchema.safeParse({...validCue, transition: 'instant'}).success === false`.
  - `repo-events.test.ts`:
    - saving a cue with `transition: 'fade_out_in'` and reading the event back returns `'fade_out_in'`; `null` round-trips as `null`.
    - a raw insert `UPDATE cues SET transition = 'instant'` throws (CHECK).
  - `export.test.ts`:
    - an export of a cue with `transition: 'fade_out_in'` and settings `defaultTransition: 'fade_out_in'` imports back with both values.
    - a v1 JSON fixture with neither field parses, giving cue `transition: null` and settings `defaultTransition: 'crossfade'`. If `settingsSchema` is strict on missing keys, run import settings through `parseSettings`.
  - `snapshot.test.ts`: the snapshot built from a detail carries `cues[i].transition` and `settings.defaultTransition`.

- [ ] **Step 2: Run** `npx vitest run tests/lib/validation.test.ts tests/server/repo-events.test.ts tests/events/export.test.ts tests/offline/snapshot.test.ts`. Expected: FAIL on the new cases.

- [ ] **Step 3: Implement**
  - Schema: add `transition: text()` (nullable) to `cues`.
  - Add `check("cues_transition_check", sql\`${t.transition} IS NULL OR ${t.transition} IN ('crossfade','fade_out_in')\`)`.
  - Run `npm run db:generate`. Read the generated SQL: if drizzle recreates the table, it must copy every existing column and keep every existing CHECK.
  - Map `transition` in `rowToCue`/`cueToRow`.
  - Export schema: add `transition: transitionSchema.nullable().optional()`. Map `undefined` to `null` on import.
  - Export settings go through `parseSettings`-compatible handling, so a missing `defaultTransition` falls back.
  - Fix every TypeScript error that `Cue`/`EventSettings` literals now raise across `src/` and `tests/`, such as the fixture `cue()` helpers. Use `transition: null` and the spread of `DEFAULT_SETTINGS`.

- [ ] **Step 4: Run** the same command, then `npx tsc --noEmit` and `npm test`. Expected: all PASS.

- [ ] **Step 5: Commit** with `feat(data): per-cue transition column and default transition setting`.

---

### Task 2: Machine — Fade out → In

**Files:**
- Modify: `src/lib/playback/machine.ts`
- Test: `tests/playback/machine.test.ts`, `tests/playback/fixtures.ts`

**Interfaces:**
- Consumes: `Transition`, `Cue.transition`, `EventSettings.defaultTransition` (Task 1).
- Produces:
  - `Command` variants become `{ type: "play"; deck: Deck; delaySec?: number }` and `{ type: "ramp"; deck; to; seconds; pauseAtEnd?: boolean; delaySec?: number }`. `delaySec` is present only when > 0, so existing `toEqual` tests stay valid.
  - `export function resolveTransition(cue: Cue, s: EventSettings): Transition`, which returns `cue.transition ?? s.defaultTransition ?? 'crossfade'`. The last fallback is for legacy snapshots.

**Rules.** All other behaviour is unchanged. Let `T` be `resolveTransition` of the cue named below.

1. **GO_CUE / NEXT_CUE into a *song* cue with `T = 'fade_out_in'`:**
   - Emit the outgoing commands exactly as today: from background, `fadeOutBg` over `fadeIn(cue)`; from a playing cue, `endCue` over `fadeOut(prev)`.
   - `d_out` is the outgoing ramp's `seconds` (after `dur`), or 0 when no outgoing ramp was emitted.
   - Incoming: `load` with no delay, then `play` with `delaySec: d_out`, then `ramp(deck, volume, fadeIn(cue))` with `delaySec: d_out`.
2. **`toBackground` (BACK_TO_BACKGROUND, cue end with `resume_background`, a *background*-kind GO_CUE):**
   - Use the T of the cue being ended (`playingCue` before `endCue`).
   - If that T is `'fade_out_in'` and `endCue` emitted a fade, `resumeBg` emits `play` and the ramp-up with `delaySec: dur(ended.fade)`. Its `load` is never delayed.
3. **Unchanged:** START_BACKGROUND from idle, FADE_STOP, the bg↔bg crossfade, and `crossfade` cues.

- [ ] **Step 1: Write the failing tests** in `machine.test.ts`, in a `describe("fade_out_in")`:
  - **From background:**
    - `q1` set to `transition:'fade_out_in'`, state in background, `GO_CUE 1`.
    - Commands include `ramp(bg active, 0, 3, pauseAtEnd)` and `{type:"load",deck:"cue0",songId:"c1",atSec:45}`.
    - They also include `{type:"play",deck:"cue0",delaySec:3}` and `{type:"ramp",deck:"cue0",to:1,seconds:3,delaySec:3}`.
  - **From another cue:** with prev `fadeOutSec: 2` playing on cue0, GO_CUE into a fade_out_in cue gives cue1 `play`/`ramp` `delaySec: 2`.
  - **Default from settings:** `transition: null` with `settings.defaultTransition: 'fade_out_in'` behaves as the case above; with `'crossfade'`, no command has `delaySec`.
  - **Nothing audible:**
    - from idle (`initialState`), GO_CUE into a fade_out_in cue → no command has `delaySec`;
    - same after `FADE_STOP`.
  - **Re-press during the wait:**
    - after `GO_CUE` fade_out_in from background, `BACK_TO_BACKGROUND` emits a non-delayed `ramp(cue0, 0, …, pauseAtEnd)`;
    - state ends with `mode: "background"`.
  - **Cue ending under fade_out_in:**
    - a playing fade_out_in cue with `fadeOutSec: 2` receives `CUE_ENDED`;
    - this emits `ramp(cue deck, 0, 2, pauseAtEnd)` plus bg `play`/`ramp` with `delaySec: 2`;
    - when the bg was never started, there is also a `load` without `delaySec`.
  - **Legacy:**
    - `resolveTransition({...cue, transition: undefined} as unknown as Cue, {...DEFAULT_SETTINGS, defaultTransition: undefined} as unknown as EventSettings)` returns `'crossfade'`.

- [ ] **Step 2: Run** `npx vitest run tests/playback/machine.test.ts`. Expected: the new cases FAIL and the old ones PASS.

- [ ] **Step 3: Implement** the rules above in `machine.ts`.
  - `goCue` and `toBackground` compute `d_out` from the outgoing step they already run. Pass the delay into `resumeBg` as a new optional parameter.
  - Update the `Command` doc comment: a delayed command waits `delaySec`, and any newer command on the same deck cancels it.

- [ ] **Step 4: Run** `npx vitest run tests/playback`. Expected: PASS, with no change to existing expectations.

- [ ] **Step 5: Commit** with `feat(playback): fade out → in transition with delayed incoming deck`.

---

### Task 3: Driver — `delaySec`

**Files:**
- Modify: `src/lib/playback/audio-driver.ts`
- Test: `tests/playback/audio-driver.test.ts`, using the existing fakes and `vi.useFakeTimers()`.

**Interfaces:**
- Consumes: `Command.play.delaySec` and `Command.ramp.delaySec` (Task 2).
- Produces: no new exports.

**Decision (deviates from the spec's `setValueAtTime(now+delay)` wording, with the same audible result).**
- Each deck gets `delayed: { timer: Timer; commands: DeckCommand[]; runId: number } | null`.
- A command with `delaySec > 0` is stored. Same-run commands on that deck join one batch, and the deck's first delay starts the timer.
- When the timer fires, it replays the batch in order through `deckCommand` with `delaySec` stripped. The existing `fading`/`loading` queueing therefore still applies.
- Any later `load`, `play` or `ramp` on that deck clears the batch (`clearTimeout`). This includes a delayed one arriving in a *different* `run`, and the `dispose` cleanup.
- Commands in the batch do **not** clear the deck's pending `pauseAtEnd` until they fire.
- Why one timer: `play` and the ramp start in the same tick and cannot drift apart. The incoming deck is at gain 0 after its `load`, so holding until fire-time is silent.

- [ ] **Step 1: Write the failing tests** in `describe("delaySec")`:
  - **Delayed play and ramp wait:**
    - after `run([{load cue0 c1 at 0}, {play cue0, delaySec:2}, {ramp cue0 to 1 seconds 3, delaySec:2}])` and metadata;
    - the element is not playing and gain stays 0 at 1999 ms;
    - at 2000 ms, `play()` was called and a linear ramp to 1 over 3 s was scheduled.
  - **A newer ramp cancels the batch:** a non-delayed `ramp cue0 to 0 seconds 1 pauseAtEnd` at 500 ms → at 5000 ms `play()` was never called.
  - **A load cancels the batch:** a new `load` on the deck at 500 ms → the old delayed `play` never fires.
  - **A newer delayed batch replaces the old one:** a second `run` with `{play cue0, delaySec:1}` at 500 ms → exactly one `play()`, at 1500 ms.
  - **Other decks are unaffected:** a delayed batch on cue0 is not cancelled by commands on bg0.
  - **dispose:** `dispose()` during the wait → no `play()` afterwards.

- [ ] **Step 2: Run** `npx vitest run tests/playback/audio-driver.test.ts`. Expected: new cases FAIL.

- [ ] **Step 3: Implement** the decision above in `audio-driver.ts`.

- [ ] **Step 4: Run** `npx vitest run tests/playback` and `npm test`. Expected: PASS.

- [ ] **Step 5: Commit** with `feat(driver): delayed play/ramp per deck, cancelled by any newer deck command`.

---

### Task 4: Theme, font and app shell

**Files:**
- Modify: `src/app/globals.css`, `src/app/layout.tsx`, `src/components/ui/button.tsx` (radius/size variants only), and the 5 pages that import `AppHeader`: events, event editor, load, library, admin/users.
- Create: `src/components/app-shell.tsx`, `src/components/brand-logo.tsx`, `src/components/offline-status.tsx`
- Delete: `src/components/app-header.tsx`
- Test: `tests/components/app-shell.test.tsx` (new)

**Interfaces:**
- Consumes: `User` from `@/server/auth/session`, and `logout` from `@/app/login/actions`.
- Produces:
  - `AppShell({ user, children }: { user: User; children: React.ReactNode })`, a server component. It renders the brand, the nav and the logout form, then `<main>` with the children. It contains a client `NavLinks` that uses `usePathname()` for the active item (`aria-current="page"`).
  - `BrandLogo({ className?: string })`.
  - `OfflineStatus()`, a client component. It shows "Sẵn sàng offline" with a success dot when `navigator.serviceWorker.controller` is set, otherwise "Chưa sẵn sàng offline" in muted text.
  - Tokens:
    - CSS vars `--surface-2`, `--accent-gold`, `--accent-gold-foreground`, `--success`;
    - exposed in `@theme inline` as `bg-surface-2`, `bg-gold`, `text-gold-foreground`, `text-success`;
    - shadcn's `--accent` stays the hover surface.

- [ ] **Step 1: Write the failing test** `app-shell.test.tsx`:
  - Render with `user = {isAdmin:false,…}`:
    - links "Chương trình" → `/events` and "Kho nhạc" → `/library`;
    - no "Người dùng" link;
    - a `button` named "Đăng xuất".
  - With `isAdmin: true`, a link "Người dùng" → `/admin/users`.
  - With `usePathname` mocked to `/library/x`, "Kho nhạc" has `aria-current="page"`.
  - A button named "Mở menu" with `aria-expanded="false"`; clicking it sets `aria-expanded="true"` and the nav is visible.
  - If the server component cannot render in jsdom, test an exported client `ShellFrame` holding the same markup.

- [ ] **Step 2: Run** `npx vitest run tests/components/app-shell.test.tsx`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement**
  - Tokens:
    - replace the `:root`/`.dark` oklch blocks with the palette from Global Constraints;
    - set `--radius: 0.625rem` (10px controls), and use `rounded-2xl` (16px) on cards;
    - add a `@media (prefers-reduced-motion: reduce)` rule that clamps transitions.
  - `layout.tsx`:
    - `Be_Vietnam_Pro({ subsets: ['vietnamese','latin'], weight: ['400','500','600','700'], variable: '--font-sans', display: 'swap' })`;
    - drop Geist;
    - keep `<html lang="vi" class="dark">`.
  - Shell layout:
    - at ≥1024 px, a fixed 248 px left sidebar: logo, nav with lucide icons (`ListMusic`, `Library`, `Users`, `LogOut`), and `OfflineStatus` pinned at the bottom;
    - below 1024 px, a top bar with the logo and the "Mở menu" button, which toggles the nav as a panel.
  - Swap `AppHeader` for `AppShell` in the 5 pages and delete `app-header.tsx`.
  - Keep each page's heading text.

- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, and `npm run test:e2e`. Expected: PASS. e2e covers "Đăng xuất" and the headings.

- [ ] **Step 5: Commit** with `feat(ui): purple/gold tokens, Be Vietnam Pro, sidebar app shell`.

---

### Task 5: Editor restyle + transition fields

**Files:**
- Modify:
  - `src/app/events/[id]/components/EditorClient.tsx`
  - `src/app/events/[id]/components/CueList.tsx`
  - `src/app/events/[id]/components/CueEditor.tsx`
  - `src/app/events/[id]/components/SettingsPanel.tsx`
  - `src/app/events/[id]/components/BackgroundList.tsx`
  - plus the small field components there, as needed
- Test: `tests/events/EditorClient.test.tsx`

**Interfaces:**
- Consumes: `Cue.transition`, `EventSettings.defaultTransition`, `transitionSchema` (Task 1).
- Produces: `TRANSITION_LABEL: Record<Transition, string> = { crossfade: "Crossfade", fade_out_in: "Fade out → In" }`, exported from `src/app/live/components/transition-label.ts`. This task creates the file with just this constant; Task 6 adds the helper.

- [ ] **Step 1: Write the failing tests** in `EditorClient.test.tsx`, using the existing render harness and save mocks:
  - A song cue's editor shows a select labelled "Kiểu chuyển" with options "Theo cài đặt chung", "Crossfade", "Fade out → In". It defaults to "Theo cài đặt chung" when `transition` is `null`.
  - Choosing "Fade out → In" triggers a cue save whose payload has `transition: 'fade_out_in'`. Choosing "Theo cài đặt chung" saves `null`.
  - A background-kind cue shows no "Kiểu chuyển" control.
  - The settings panel shows "Kiểu chuyển mặc định", with only "Crossfade" and "Fade out → In". Changing it saves settings with `defaultTransition: 'fade_out_in'`.
  - Each cue row (`data-testid="cue-item"`) shows its transition text: "Crossfade 3s" or "Fade out → In …". Background-kind rows show "Nhạc nền".

- [ ] **Step 2: Run** `npx vitest run tests/events/EditorClient.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement**
  - Use native `<select>` styled with tokens; this matches the existing "Loại" / "Khi hết bài" selects and keeps `getByLabel` working.
  - Layout:
    - three cards: "Nhạc nền", "Kịch bản", "Cài đặt";
    - the cue list as a table-like grid: drag handle, two-digit number, name, note, transition + duration, save status.
  - Row transition text: until Task 6 exists, use `TRANSITION_LABEL` + `fadeIn`. Task 6 will switch it to `transitionLabel`.
  - Keep the existing flush-and-await nav buttons, `SaveIndicator`, the `track('op:reorder:cues')` path, and every label and testid.

- [ ] **Step 4: Run** `npm test` and `npm run test:e2e` (editor.spec, export.spec). Expected: PASS.

- [ ] **Step 5: Commit** with `feat(editor): card layout, cue table, transition fields`.

---

### Task 6: Live restyle + transition labels

**Files:**
- Modify:
  - `src/app/live/LiveClient.tsx`
  - `src/app/live/components/NowPlaying.tsx`
  - `src/app/live/components/CueColumn.tsx`
  - `src/app/live/components/BackgroundPanel.tsx`
  - `src/app/live/components/ControlBar.tsx`
  - `src/app/live/components/transition-label.ts`
- Modify (switch to the helper): `src/app/events/[id]/components/CueList.tsx`
- Test: `tests/live/transition-label.test.ts` (new), `tests/live/components.test.tsx`, `tests/live/LiveClient.test.tsx`

**Interfaces:**
- Consumes: `resolveTransition`, `fadeIn`, `fadeOut` (machine, Task 2), and `TRANSITION_LABEL` (Task 5).
- Produces: `export function transitionLabel(cues: Cue[], index: number, s: EventSettings): string` in `transition-label.ts`:
  - a background-kind cue gives `"Nhạc nền"`;
  - crossfade gives `` `Crossfade ${n(fadeIn(cue, s))}s` ``;
  - fade_out_in gives `` `Fade out → In ${n(out)}s + ${n(fadeIn(cue, s))}s` ``, where `out` is `fadeOut(prev, s)` when `cues[index-1]` is a song cue, otherwise `fadeIn(cue, s)` (the background fades over the incoming fade-in);
  - `n` prints integers without a decimal (`3`) and other values with one decimal (`2.5`).

- [ ] **Step 1: Write the failing tests**
  - `transition-label.test.ts`:
    - a crossfade cue with default 3 s → `"Crossfade 3s"`;
    - a fade_out_in cue with `fadeInSec: 2` after a song cue with `fadeOutSec: 2` → `"Fade out → In 2s + 2s"`;
    - fade_out_in after a background cue, with `fadeInSec: 2.5` → `"Fade out → In 2.5s + 2.5s"`;
    - a background-kind cue → `"Nhạc nền"`;
    - legacy objects with no `transition`/`defaultTransition` → `"Crossfade 3s"`.
  - `components.test.tsx`:
    - each `cue-row` shows its `transitionLabel`;
    - the current row reads "Đang phát" and cannot be clicked;
    - other rows have a button named "Chọn";
    - the next-cue card (`data-testid="next-cue"`) shows the next cue's name, `Kiểu: <label>` and a button "Chuyển bài ngay";
    - the quick-control strip shows "Kiểu chuyển mặc định: Crossfade".
  - Run `grep -rn "Chuyển tiết mục\|Nhạc vào\|editor-cue" e2e tests` first. Keep any label those tests use as the button's accessible name, or update those tests in this commit.

- [ ] **Step 2: Run** `npx vitest run tests/live`. Expected: FAIL on the new cases.

- [ ] **Step 3: Implement the layout from spec §3 "Màn hình Live".** All layout is in plain JSX inside the existing files; no new lazy imports.
  - Top bar: a LIVE pill (success), a master volume slider bound to the existing `SET_MASTER` handler, `OfflineStatus` (reuse it if it adds no network or dynamic import, otherwise keep `offline-badge`), and "Thoát".
  - Row 1:
    - an ĐANG PHÁT card (`now-playing`) with a purple→gold music tile (lucide `Music`), cue name, song, progress bar, and `m:ss / m:ss` in `tabular-nums`;
    - next to it a gold TIẾP THEO card (`next-cue`).
  - Row 2: a KỊCH BẢN table (`cue-row`) with ✓/▶ icons (lucide `Check` / `Play`), a NHẠC NỀN panel (`bg-status`) and "Gợi ý" showing the current or next cue's note.
  - Bottom: ĐIỀU KHIỂN NHANH, with "Về nhạc nền (B)" and "Fade out & dừng (F)" (destructive styling) plus the default-transition text.
  - Restyle the "ĐANG IM LẶNG" and audio-suspended banners, the start overlay and the resume prompt, without changing their behaviour.
  - In `CueList.tsx`, replace the Task 5 interim text with `transitionLabel`.

- [ ] **Step 4: Run** `npm test` and `npm run test:e2e` (offline.spec, load.spec). Confirm the live tests still show zero network requests. Expected: PASS.

- [ ] **Step 5: Commit** with `feat(live): soundboard layout, next-cue card, transition labels`.

---

### Task 7: Restyle the remaining pages

**Files:**
- Modify:
  - `src/app/events/components/EventList.tsx` and `src/app/events/page.tsx`
  - `src/app/events/[id]/load/LoadClient.tsx`
  - `src/app/library/components/*`
  - `src/app/admin/users/page.tsx` and `DeleteUserForm`
  - `src/app/login/page.tsx` and `src/app/login/login-form.tsx`
- Test: existing `tests/**` and `e2e/*` only (visual-only task)

**Interfaces:**
- Consumes: the Task 4 tokens (`bg-card`, `bg-surface-2`, `bg-gold`, `text-success`), `BrandLogo`, `AppShell`.
- Produces: nothing new.

- [ ] **Step 1: Restyle** each page as cards on the dark background:
  - tables get `surface-2` row hover;
  - primary actions are purple;
  - destructive actions use `destructive` on `#3A1A22`;
  - the Load page's "Bắt đầu tiệc" uses the gold accent;
  - login is a centred card with `BrandLogo`.
  - Keep every label, testid and role. Use icons from lucide only.
- [ ] **Step 2: Run** `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run test:e2e`. Expected: PASS.
- [ ] **Step 3: Commit** with `feat(ui): restyle events, load, library, login and admin pages`.

---

### Task 8: Screenshot pass + full verification

**Files:**
- Create: `e2e/screens.spec.ts`
- Modify: `.gitignore` (add `e2e-screens/`)

- [ ] **Step 1: Write `e2e/screens.spec.ts`.**
  - Use the same login/seed helpers as the other specs.
  - Save full-page screenshots to `e2e-screens/<name>.png` at 1440×900: login, events, editor, library, load, live (after start, with a cue playing), admin users.
  - Also capture the editor at 768×1024.
  - At both sizes, assert `document.documentElement.scrollWidth <= window.innerWidth` (no horizontal scroll).
- [ ] **Step 2: Run** `npx playwright test e2e/screens.spec.ts`. Expected: PASS with 8 PNGs written.
- [ ] **Step 3: Review the PNGs by eye**, checking:
  - contrast;
  - alignment;
  - Vietnamese diacritics rendered in Be Vietnam Pro;
  - no emoji;
  - the gold card stands out.
  Fix what's off and re-run.
- [ ] **Step 4: Run** `npm test` and `npm run test:e2e`. Expected: all PASS.
- [ ] **Step 5: Commit** with `test(e2e): screenshot pass for the redesign`.
