# Achievement map, library sync and guide-aware AI

Date: 2026-11-01. Status: awaiting owner approval.

## Why

The owner hunts achievements by doing the easiest first and checking the tips, and likes how the site does that today. Three things are missing:

1. Achievements only load one game at a time, so most of the library looks empty.
2. There's no picture of how a game's achievements fit together. The optimization page meant to provide one is broken: it calls API functions that don't exist.
3. The AI only has real reference material for Stardew Valley. Links the owner saves for other games aren't read.

Success: one Sync fills the library, and any synced game has a good-looking map of its achievements, informed by the owner's guide links.

## Goals

- One Sync button loads the game list, then achievements across the library, with visible progress.
- A separate achievement map page for each game, in a look the owner approved.
- AI tips and routes read the saved guide links for any game.
- Gemini calls move from the deprecated `google-generativeai` to `google-genai`.

## Non-goals

- Changing the existing achievement list, filters, sort, search or drawer behaviour on the game page.
- Server-side tip caching, automatic guide discovery, YouTube transcripts.
- A route across the whole library. Routes are per game.
- Replacing the Stardew wiki source; that proof of concept stays.

## Anti-goals (failure even if it works)

- The map looks like a wireframe. The owner rejected plain circles and lines as ugly.
- The AI's guess overrides Steam's facts. Unlock status always comes from Steam.
- A failure on one game stops the library sync, or marks a game as having no achievements when Steam simply errored.
- Saved links let the server reach internal addresses (see Security).

## Constraints

- **Real data:** the local DB holds player id 2, the owner's account. No destructive changes. UI tests use a throwaway player and games, deleted afterwards.
- **No schema changes.** The repo has no migrations folder and `init.sql` only runs on an empty database, so anything that alters tables would break or wipe the existing volume. Use existing columns.
- **Request limit:** gunicorn kills a request after 120 s and has 2 sync workers. Steam allows the app 1 call per second, about 3 calls per game.
- **Single user for now (owner's decision):** only the owner signs in. Gemini rate limits, per-person guide links, moving generation out of the request, and pinning the checked IP against DNS rebinding are all skipped. Mark each in code as `shortcut: <the limit>, <when to upgrade>`, and all must be added before sharing the app.
- **Smallest complete change:** the owner prefers this. No new dependencies other than `google-genai`.
- **Tests:** backend uses `unittest` with in-memory SQLite and mocks external calls. Frontend logic goes in `src/utils` with `node --test`. There's no React test setup, and none gets added.
- **Commits:** no `Co-Authored-By` line. The owner pushes and opens PRs.

## 1. Gemini SDK

Move to `google-genai`, pinned in `requirements.txt`, replacing `google-generativeai`. Keep the `GEMINI_MODEL` setting and the current tip behaviour, prompt and response shape. Put the client call in a small `services/gemini.py`, since tips and routes both need it. Done first, and verified with one real tip before anything is built on it.

## 2. Guide links in the AI

`DataSource` already has `scraped_content` and `last_scraped`, and `ScraperService.scrape_url` exists.

- When a tip or route is generated, use up to 5 saved non-YouTube links for that game. Links with no stored content, or content older than 7 days, are scraped then and stored. Links are never scraped on save, so saving stays instant.
- Limit each link to 20,000 characters in the prompt. The whole scraping step gets a 45-second budget, after which generation continues with what it has.
- A link that can't be read is logged and skipped, and generation carries on. Old stored content is still used if a re-scrape fails.
- Stardew keeps its wiki source, added alongside any saved links.
- Page text goes in the prompt marked as untrusted reference material, with an instruction not to follow anything written in it.

### Security: scraping user-supplied URLs

The server now fetches addresses users typed, so `scrape_url` must only be used through a check that:

- allows http(s) only, on the default ports (80 and 443);
- resolves the hostname and refuses private, loopback, link-local and reserved addresses (this covers `db`, `backend`, `localhost` and cloud metadata);
- applies the same check to every redirect, following at most 3;
- stops reading a response above 5 MB, and only parses HTML or plain text.

The hardcoded Stardew URL goes through the same path. Tests cover refused addresses and redirects, with no real network calls.

## 3. One-button library sync

- `POST /api/sync/games` stays, and its response adds `achievement_app_ids`: the games to sync next.
- Selection uses Steam's `has_community_visible_stats` field from `GetOwnedGames`. **The builder must check this against real responses first.** If it wrongly excludes games that have achievements, send every game instead; `sync_achievements` already handles games with none.
- The dashboard's Sync button then calls the existing `POST /api/sync/achievements/<app_id>` one game at a time and shows "Syncing 12 of 63". Sequential calls from the browser avoid the 120-second limit.
- The dashboard stays usable during a sync. Leaving the page stops the loop, and the next Sync starts again from the beginning.
- Each game's failure is caught and counted. At the end: "Synced 60 of 63. 3 couldn't be loaded; press Sync to try again." A failed game keeps whatever data it had.
- Games with no achievements stay listed. The Dashboard data refreshes when the sync finishes.
- A Steam rate-limit response (429) stops the loop and tells the user to try again later, instead of failing every remaining game.

**Telling the three cases apart (owner's data stays safe; no schema change).** `Game.total_achievements` is nullable and carries the state. `NULL` means not checked yet, so the card keeps "Not synced yet". `0` means Steam confirmed there are none, and a new card label says "No achievements". Above 0 is the count. `sync_games` turns a `0` into `NULL` so stale rows get rechecked, and sets `0` for games it deliberately skips. Failed games stay `NULL`. Frontend code already treats a null total as 0 in `stats.js`.

**Fix first: Steam errors must not look like empty results.** `SteamAPIService` turns HTTP errors into empty lists. Today, if `get_player_achievements` fails, `sync_achievements` writes `unlocked = False` over real unlocks, and a library sync would repeat that risk across every game. Before building the loop:

- Real failures (network errors, 403, 429, 5xx) raise an error. `sync_achievements` returns an error status and changes nothing for that game, including on the game page's existing Sync button. A 429 reaches the browser as a 429.
- Steam's specific "this game has no stats" answer stays a normal empty result.
- A failed or empty player response never overwrites an existing unlock.
- A regression test covers each case, starting with "Steam fails, existing unlocks are untouched".

## 4. Achievement map

### Backend

`GET /api/ai/routes/<game_id>` returns the caller's saved route, or 404. `POST /api/ai/routes/<game_id>` creates or replaces it. Both need login and the game in the caller's library (`owns_game`). POST returns 400 with a clear message if the game has no synced achievements.

Generation sends Gemini the game, every achievement (api_name, name, description, global percent), the player's unlocked state, and guide-link text. It requests structured JSON:

```json
{
  "message": "2-3 plain sentences on how to approach this game",
  "shape": "story | themed",
  "branches": [
    {
      "name": "Money",
      "kind": "main | side",
      "branches_from": "api_name of the main-branch step this opens after, or null",
      "steps": [
        { "api_name": "ACH_X", "missable": false, "missable_note": null }
      ]
    }
  ]
}
```

Order within a branch runs from first or easiest to last or hardest, and a story game has one `main` branch. Gemini is told to mark something missable only if its sources or strong game knowledge support it.

The server validates the response before saving:

- Unknown `api_name`s are dropped.
- Duplicates keep their first position.
- An invalid `branches_from` becomes null, which attaches that side branch at the top of the trunk. A side branch's position means "available after this step".
- Any achievement left out goes into a final branch called "Other", ordered by global percent, most common first.
- Invalid JSON gets one retry, then a 502 with a clear error. An existing route is only replaced after the new one validates.
- The output limit must fit the game's achievement count, because cut-off JSON counts as invalid. The output stays compact (api_names, with notes only on missable steps) and the whole request must finish inside the 120-second limit. Test with the largest game in the owner's library.

Storage: the existing `OptimizationRoute` row, one per player and game (upsert in code; the table has no unique constraint). The validated JSON is stored as text in `summary_md`, because adding a column isn't an option. `source_ids_used` holds the links used and `model_used` the model. `prompt_hash` stays unused. The API returns the route parsed. Unlock status isn't stored in the route; the page joins it from the player's achievements on load, so the map updates without a rewrite.

### Frontend

- `OptimizationPage` is rebuilt at the existing `/games/:gameId/optimize`, following `docs/superpowers/specs/mockups/route-tree-v2.html` (copied from the approved mockup).
- GameDetailPage gets one new "View route" link. Nothing else on that page changes.
- Page: game banner (`library_hero.jpg`, falling back to plain background) fading into the site background; title; the Gemini message; progress bar; the cover as the tree's root; branches with named labels; achievement icons as nodes.
- Node states: done (colour icon, green outline and tick), next (colour icon, white outline, soft pulse, "Do this next"), later (grey icon). A node is "next" when it's the first unfinished step on its branch. A missable node shows a warning on itself, with its note in the drawer, and the message mentions it.
- **Long branches (owner's decision):** each branch shows its done steps collapsed to the most recent one, then the next few, then a "+40 more" control that expands the rest in place. Every achievement is reachable with a click, but the first view stays close to the approved mockup. Exact counts are left to the builder.
- Clicking a node opens the existing `AchievementPanel`, guide included.
- Completed connector lines draw once on page open. Motion respects `prefers-reduced-motion`.
- Nodes are real buttons with visible keyboard focus. All text meets contrast requirements. Both the light and dark site themes work, using existing tokens rather than the mockup's hardcoded colours.
- A story game renders one trunk down the centre, with side branches off it at their `branches_from` step. Layout is computed in a tested `src/utils` function from the route JSON. The story layout has no approved mockup yet, so show the owner one before building it.
- A label says the route is AI-generated and can be wrong.
- States: no route yet ("Map this game" button); generating (progress message, 15-30 s); failed (error with retry, keeping any old route on screen); game not synced (prompt to sync, linking back to the game page); Rewrite button when a route exists.
- Phones: the tree scrolls sideways inside its own container, and the page itself doesn't.

## Order of work

Steam error fix (protects real data), then SDK, then guide links and scraping security, then library sync, then the map. Each goes on its own branch and PR, because each is useful alone.

## Left to the builder

Exact file organization inside the frontend, the layout algorithm, prompt wording, the precise Gemini schema call, and how to split commits.

## Calls made without the owner

Gemini generates the shape; a missing achievement goes to "Other"; failed games retry on the next Sync; saved routes persist with Rewrite; the map uses the existing `/optimize` address; links are scraped at generation time; the 5-link, 20,000-character, 45-second, 7-day and 5 MB limits; storing JSON in `summary_md`; `NULL` versus `0` in `total_achievements`; the Steam error fix going first; `branches_from` for side branches.
