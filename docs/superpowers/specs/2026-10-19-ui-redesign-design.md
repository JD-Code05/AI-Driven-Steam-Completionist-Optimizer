# UI redesign: light/dark, day–night switch, new login, dashboard and game page

Date: 2026-10-19
Status: direction approved; owner decisions recorded below; awaiting sign-off on this document

## Why

The current frontend reads as AI-generated: navy gradients, glowing borders, a purple "AI" accent,
gradient text, emoji headings, icons boxed in rounded squares, and identical rounded cards everywhere.
The owner wants it to look designed and to offer both a light and a dark version, switched with an
animated sun/moon control.

Approved mockups (plain HTML, open directly in a browser):

- `docs/superpowers/specs/mockups/motion-v2.html`: dashboard, day/night switch, cover carousel
- `docs/superpowers/specs/mockups/login-v1.html`: login page
- `docs/superpowers/specs/mockups/game-v1.html`: game page and achievement panel

The mockups are the reference for look, spacing, copy and motion. Where this document and a mockup
disagree, this document wins.

## Goals

1. One token-based theme with light and dark values; every page uses only these tokens.
2. Theme follows the system by default; the sun/moon switch overrides it and the choice persists.
3. Rebuild Login, Dashboard, Game page and the achievement detail view to match the mockups.
4. Keep every feature that works today (sync, track, filters, guide links, AI tip per achievement, all-games view).

## Non-goals

- The completion route page (`/games/:id/optimize`) design. It is unfinished and gets only the new tokens so it
  does not look broken next to the rest; no layout work. The "Completion route" cards shown in the mockups are
  left out until that feature exists.
- New backend features (scraping guide links, using them in prompts, saving tips server-side). See owner decision 2.
- A Library page. The mockup's "Library" nav link is dropped.

## Anti-goals (would make this a failure even if it works)

- Any of the slop markers above coming back: gradients as decoration, glows, purple AI branding, emoji headings,
  icon-in-a-box tiles.
- Color used for decoration. Color appears only in game art, the four rarity tiers, the gold "perfect" state,
  the warning box, and the sky inside the theme switch.
- Motion on high-frequency actions (typing in search, filter tabs, sorting).
- A flash of the wrong theme on page load.

## Constraints

- Stack stays: React 19, Vite 6, Tailwind v4, react-router 7, react-icons, react-markdown. No new runtime
  dependencies. No motion library: CSS transitions, CSS keyframes, the View Transitions API and WAAPI cover everything.
- Must work at 375px wide with no horizontal scroll (the mockup nav overflowed at 375px; fixed in `game-v1.html`).
- Every animation has a `prefers-reduced-motion` variant (gentler, not removed), and hover motion is gated by
  `(hover: hover) and (pointer: fine)`.

## Design decisions

### Theme tokens

Defined once in `frontend/src/index.css` as CSS variables under `[data-theme="light"]` and `[data-theme="dark"]`
on `<html>`, and exposed to Tailwind through `@theme inline` so utilities like `bg-surface` and `text-muted` resolve
to the variables. No `dark:` variants in components. The old `steam-*`, `surface-*` and `rarity-*` tokens are removed.

| Token | Light | Dark |
|---|---|---|
| bg | #f6f5f2 | #111110 |
| surface | #ffffff | #1a1a19 |
| hover | #f1f0ec | #222220 |
| border | #e4e2dc | #2a2927 |
| border-strong | #d3d0c8 | #383633 |
| text | #1a1a18 | #edece8 |
| muted | #6b6963 | #9b9891 |
| faint | #9c9a93 | #6d6b65 |
| ink (buttons, progress) | #1a1a18 | #edece8 |
| on-ink | #ffffff | #111110 |
| track (empty bars, placeholders) | #ebe9e4 | #2a2927 |
| common / bg | #77746c / #efeee9 | #a19e96 / #232321 |
| uncommon / bg | #2f7d4f / #e6f2ea | #6cc28f / #17281e |
| rare / bg | #2f5fc4 / #e9eff9 | #86a9f0 / #1b2333 |
| ultra (also "perfect" gold) / bg | #a8650f / #fbf1e1 | #e5ad55 / #2e2416 |
| warn / bg | #9a4a12 / #fdf0e6 | #f0a46a / #2c1e14 |
| scrim | rgba(20,20,18,.35) | rgba(0,0,0,.55) |
| sky / knob / sun (switch only) | #bcdcf3 / #ffffff / #f2b233 | #232a3d / #3b4257 / #e9e6f2 |

Motion tokens: `--ease-out: cubic-bezier(0.23,1,0.32,1)`, `--ease-in-out: cubic-bezier(0.77,0,0.175,1)`,
`--ease-drawer: cubic-bezier(0.32,0.72,0,1)`.

Rarity thresholds stay as the backend computes them (`<5` ultra rare, `<15` rare, `<30` uncommon, else common).

Type: Geist (Google Fonts link in `index.html`, weights 400/500/600/700), `font-variant-numeric: tabular-nums`
on numbers. Hierarchy from size and weight only.

### Theme switch and persistence

- A `ThemeSwitch` component in the navbar and on the login page: `role="switch"`, `aria-checked`, label "Dark mode".
  Visuals and motion exactly as in the mockups (knob slide 450ms ease-in-out, rays rotate and fade, crescent mask,
  stars fade in with 60ms stagger, cloud drifts out).
- Choice is stored in `localStorage` under `theme` (`"light"` / `"dark"`); no stored value means follow the system,
  including live changes to the system setting.
- An inline script in `index.html` sets `data-theme` before React loads, so there is no flash.
- Switching uses `document.startViewTransition` with a circle reveal from the switch (650ms, ease-in-out).
  Without View Transitions support, or with reduced motion, the theme swaps with a 300ms color crossfade.

### Navbar

Brand wordmark (see owner decision 3), "Dashboard" link, theme switch, avatar, and a plain "Log out" text button.
At ≤520px the avatar hides and gaps tighten so it fits in 375px; "Log out" stays. (Builder call by Claude: no
dropdown menu, since there is only one account action.)

### Login page

As `login-v1.html`: split layout with the pitch on the left (headline "Finish the games you started.", lead,
"Sign in through Steam" button, fine print that game details must be public, three numbered steps, Valve
disclaimer) and a drifting three-column cover wall on the right with the floating "Master Angler" unlock card.
Columns loop with `translateY(0 → -50%)`, linear, 70–95s, the middle one reversed; `contain: size` on the wall so
it never sets page height. The wall uses a fixed list of popular app IDs (the user is not signed in yet).
Under 820px the wall becomes a 240px band on top and the unlock card hides. Reduced motion stops the drift.
The `?error=` values from the auth callback are shown as a short message above the button.

### Dashboard

As `motion-v2.html`:

1. Profile row: avatar, name, "Synced X ago" (latest `last_synced` across the player's games), "Sync Steam" ink button.
2. Stat strip: Games owned, Hours played, Achievements unlocked % with bar, Perfect games.
   "Achievements unlocked" = unlocked ÷ total across games whose achievements have been synced; "perfect" =
   synced game with unlocked = total > 0.
3. "In progress" carousel: native horizontal scroll with `scroll-snap`, smooth scroll, arrow buttons that page by
   one view and disable at either end; 5 covers per view on desktop, 3.3 under 900px, 2.2 under 520px.
   Contents: tracked games; if none are tracked, synced games that are not perfect, highest % first.
   Cover hover lift 3px (pointer devices only). "All games" opens the existing all-games view, restyled.
4. "Recently unlocked": the achievement row style from the game page, latest 8 unlocks across tracked games
   (today's logic), each row labeled with its game. This still costs one request per tracked game, which is
   acceptable because people track a handful of games. (Claude's call.)
5. Empty states in plain text for: no games synced, private profile, nothing tracked.

The per-game unlocked counts must come from the backend in one request, not one request per game (today's
dashboard sends one per owned game). Add `unlocked_count` to each item returned by `GET /api/player-games`,
computed with a single grouped query.

### Game page

As `game-v1.html`:

- Hero banner from `https://cdn.cloudflare.steamstatic.com/steam/apps/<app_id>/library_hero.jpg`, falling back to
  `header.jpg`, then to no banner.
- Title, "N h played · Synced X ago", "Track"/"Tracking" toggle (`aria-pressed`) and "Sync" ink button.
- Progress strip: unlocked / total and %, then one cell per rarity tier showing unlocked / total in that tier.
  Replaces the completion ring and the rarity sidebar.
- Toolbar: segmented filter All / Locked / Unlocked with counts (default All), search by name and description,
  sort: Rarest first (default), Most common first, Recently unlocked. Filter choice keeps today's per-game
  localStorage memory.
- Achievement rows are buttons: real Steam icon (gray icon when locked), name, description (one line, ellipsis),
  % of players, rarity pill, unlock date or "Locked". Under 860px rarity and status columns hide.
- Side column, "Guides" card: the game's data sources with a type label and link; add by pasting a URL; delete
  from a row action. The type dropdown is removed and the type is inferred from the URL: youtube.com/youtu.be →
  `youtube`, hosts containing "wiki" or "fandom" → `wiki`, everything else → `article`. (This removes the
  `steam_guide` option that the database rejects.) The "Read 2 days ago" status line from the mockup is shown
  only once the backend provides it (owner decision 2: not in this pass).

### Achievement panel (replaces the centered modal)

- Native `<dialog>` opened with `showModal()` for focus trapping, Escape and an inert background. Desktop: slides in
  from the right, `min(460px, 100vw)` wide, 380ms `--ease-drawer`, scrim fades 300ms; exits the same way.
  Under 860px: bottom sheet, 88vh, slides up. Reduced motion: opacity only, 200ms.
- Clicking another row while open swaps the content without re-animating; the open row is marked with
  `aria-current`. Closing returns focus to that row. Today's "remember the open achievement across reloads"
  behavior is kept.
- Content: icon, name, rarity pill, Locked / "Unlocked <date>", description; "% of players have this" with a bar;
  then "Guide".
- Guide states: none yet → dashed box with "Write a guide" ink button; loading → "Reading your guides…" plus four
  pulsing skeleton lines; error → message and "Try again"; ready → the four sections from
  `parseAchievementTip` (How to unlock, Time, Watch out, Tips), revealed with a 50ms stagger, 260ms ease-out,
  6px rise. "Rewrite" regenerates. Footer links: Steam guides search and YouTube search (today's URLs).
- The "Based on …" line names the sources actually used. Until the backend reports that, it reads
  "Written by Gemini." (or names the Stardew wiki for app 413150, matching today's backend).
- AI tips no longer require the game to be tracked.

### Cleanup that comes with it

Delete `ProgressRing`, `AchievementCard`, `AchievementDetailModal`, `RarityBadge` (if fully replaced), the
`StatCard` helper, debug `console.log`s, emoji, the "Z-PATTERN" comments, and the custom webkit scrollbar colors.
Optimization page: swap old color classes for the new tokens only.

## Left to the builder

Component boundaries and file names, how Tailwind utilities map to tokens, the exact markup, how the carousel
computes "one view", the type-inference helper's location, and loading skeletons for pages.

## Verification

- Both themes and the switch on every page; no flash on reload in either stored theme or with no stored theme.
- 375px, 768px and 1280px widths with no horizontal scroll.
- Reduced-motion emulation: no drift, no circle reveal, panel fades.
- Keyboard: switch, carousel arrows, filter tabs, rows, panel (Escape, focus return).
- Real data: sign in with a public Steam profile, sync, open a game, write a guide.
- One test for the new `unlocked_count` query and one for URL type inference.

## Owner decisions (2026-10-19)

1. **Security first.** The open login redirect and the unauthenticated data endpoints are fixed in a separate,
   smaller change that lands before this redesign. The redesign builds on the secured endpoints (for example,
   `GET /api/player-games` uses the logged-in player rather than a `player_id` parameter).
2. **UI first.** This pass uses today's backend; the only backend change is `unlocked_count` on
   `GET /api/player-games`. Anything the mockups show that the backend cannot provide yet is hidden: the Guides
   card has no "Read …" status line, and the panel's "Based on …" line follows today's behavior. Reading guide
   links, guide-based tips and server-saved tips are the next project. Tips stay cached in localStorage as today.
3. **Name stays "Steam Achievement Optimizer".** Every "Completionist" in the mockups becomes the real name: the
   navbar shows "Achievement Optimizer" (today's "AO" under 520px), and the login page shows the full name.
