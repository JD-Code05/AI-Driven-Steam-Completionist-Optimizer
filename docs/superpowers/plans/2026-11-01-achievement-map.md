# Achievement Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Steam failures harmless, sync the whole library with one button, and add a per-game achievement map informed by the owner's guide links.

**Architecture:** Backend services stay thin and testable: `SteamAPIService` raises on real failures, `services/gemini.py` wraps the SDK, `services/guide_context.py` turns saved links into prompt text, and `services/route_builder.py` validates Gemini's route. The browser drives the library sync one game at a time. Pure frontend logic lives in tested `src/utils` modules; pages only render it.

**Tech Stack:** Flask 3.1, SQLAlchemy, `google-genai`, BeautifulSoup, React 19, Tailwind v4, `node --test`, `unittest`.

**Spec:** `docs/superpowers/specs/2026-11-01-achievement-map-design.md`. Mockup: `docs/superpowers/specs/mockups/route-tree-v2.html`.

## Global Constraints

- No schema changes and no destructive DB operations. Never modify player id 2 or rows it uses.
- UI and live checks use a throwaway player and games with app_ids not already in the DB, deleted afterwards. Token: `generate_token` inside the backend container, set in `localStorage` only on `http://localhost:3100`.
- No new dependencies except `google-genai==2.34.0`, which replaces `google-generativeai`. No React test framework.
- Commits never carry a `Co-Authored-By` line. PRs carry no "Generated with Claude Code" footer. The owner pushes.
- Shortcuts use the comment form `shortcut: <the limit>, <when to upgrade>`. Required ones: no Gemini rate limit, shared per-game links, generation inside the request, no IP pinning against DNS rebinding.
- Unlock status always comes from Steam. Stardew (`app_id` 413150) keeps its wiki source.
- Every UI value uses existing theme tokens, works in light and dark, and respects `prefers-reduced-motion`.
- Run from the repo root. Backend tests: `MSYS_NO_PATHCONV=1 docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --no-deps backend python -m unittest discover -s tests`. Frontend: `node --test "frontend/src/utils/*.test.js"`.

## Branches

Each task is its own branch and PR, each cut from the previous one because they stack: `docs/route-design` → `fix/steam-errors` → `chore/google-genai` → `feat/guide-links` → `feat/library-sync` → `feat/route-api` → `feat/achievement-map`. Merge in that order.

## Review Focus

- A private Steam profile returns 403 for every game: stop the sync and explain the privacy setting, rather than listing 63 failures. Test in Task 4.
- A game gains or loses achievements after its route was saved: new ones appear in "Other", removed ones vanish, with no error. Test in Task 6.
- A saved route row holds text that isn't valid JSON: `GET` returns 404, so the page offers "Map this game". Test in Task 5.
- A saved link's URL is edited: the old page's scraped text must not be used for the new address. Test in Task 3.
- Gemini returns awkward shapes (no main branch on a story game, empty branches, very long names): the saved route is still valid. Test in Task 5.

---

### Task 1: Steam failures stop looking like empty results

**Files:**
- Modify: `backend/app/services/steam_api.py`, `backend/app/routes/sync.py`, `backend/app/routes/auth.py:75` (only if needed to keep login behaviour)
- Test: `backend/tests/test_sync.py`, create `backend/tests/test_steam_api.py`

**Interfaces:**
- Produces: `class SteamAPIError(Exception)` in `steam_api.py`, with `.status: int | None`. `_rate_limited_get` raises it for every `requests.exceptions.RequestException`.

- [ ] **Step 1: Write failing tests**

`test_sync.py`:
- `test_steam_failure_leaves_existing_unlocks_untouched`: an unlocked `PlayerAchievement` exists; `get_player_achievements` raises `SteamAPIError(status=500)`. Assert response status 502, `pa.unlocked` still True, `unlock_time` unchanged.
- `test_rate_limit_reaches_the_browser`: schema raises `SteamAPIError(status=429)`. Assert status 429.
- `test_private_profile_reaches_the_browser`: player call raises `SteamAPIError(status=403)`. Assert status 403.
- `test_empty_player_response_keeps_unlock`: player call returns `[]`. Assert the existing unlock stays True and the sync returns 200.

`test_steam_api.py`, patching `requests.get`:
- `test_player_no_stats_answer_is_empty`: status 400 with body `{"playerstats":{"success":false,"error":"Requested app has no stats"}}` returns `[]`.
- `test_schema_400_is_empty`, since Steam answers this way for games with no stats.
- `test_schema_500_raises` and `test_timeout_raises`: both raise `SteamAPIError`.
- `test_player_403_raises`, with `.status == 403`.

- [ ] **Step 2: Run the backend tests; the new ones fail**

- [ ] **Step 3: Implement**

`get_game_achievements_schema` and `get_player_achievements` return empty only for the 400 answers above and re-raise otherwise. `get_global_achievement_percentages` returns `{}` on failure except it re-raises status 429. `get_player_summary` catches `SteamAPIError` and returns `None`, so login still works. In `sync_achievements`, when `player_data` is missing, leave any existing `pa` alone (create it locked only if absent). In both sync routes, catch `SteamAPIError` before any writes: return `{'error': ...}` with 429 or 403 when that is the status, otherwise 502.

- [ ] **Step 4: Run backend tests; all pass**

- [ ] **Step 5: Commit** `fix: stop failed Steam calls from overwriting unlocks`

---

### Task 2: Move Gemini calls to google-genai

**Files:**
- Modify: `backend/requirements.txt`, `backend/app/routes/ai.py`
- Create: `backend/app/services/gemini.py`, `backend/tests/test_ai.py`
- Docs: the AI row in `CLAUDE.md`

**Interfaces:**
- Produces: `generate_text(system: str, prompt: str, *, temperature: float, max_output_tokens: int, response_schema: dict | None = None) -> str`. Reads `GEMINI_API_KEY` and `GEMINI_MODEL` from `current_app.config`. Raises `GeminiError` on SDK failure or an empty response. Exposes `model_name() -> str`. A missing key raises `GeminiNotConfigured`.

- [ ] **Step 1: Write failing tests** in `test_ai.py`, patching `app.routes.ai.generate_text`:
- `test_tip_returns_markdown`: status 200, with `tip_md`, `achievement_id` and `model_used` as today.
- `test_tip_without_key_is_400`: `GeminiNotConfigured` gives 400 with `'GEMINI_API_KEY is not configured'`.
- `test_tip_failure_is_500`: `GeminiError` gives 500.

- [ ] **Step 2: Run; they fail**

- [ ] **Step 3: Implement**

Use `genai.Client(api_key=..., http_options=types.HttpOptions(timeout=35000))` and `client.models.generate_content(model=..., contents=prompt, config=types.GenerateContentConfig(system_instruction=..., temperature=..., max_output_tokens=..., response_mime_type=..., response_schema=...))`. JSON mime type only when a schema is passed. Tips keep `temperature=0.5`, `max_output_tokens=2048`, and the same prompts and response.

- [ ] **Step 4: Run backend tests; all pass**

- [ ] **Step 5: Verify a real tip.** Rebuild the backend, then with a throwaway player generate one tip through the API. Expected: a 200 with all four sections, not cut off. If `gemini-2.5-flash` thinking consumes the output limit, say so and raise the limit.

- [ ] **Step 6: Commit** `chore: move Gemini calls to google-genai`

---

### Task 3: Guide links reach the AI, safely

**Files:**
- Modify: `backend/app/services/scraper.py`, `backend/app/routes/ai.py`, `backend/app/routes/data_sources.py`
- Create: `backend/app/services/guide_context.py`, `backend/tests/test_scraper.py`, `backend/tests/test_guide_context.py`

**Interfaces:**
- Consumes: `generate_text` from Task 2.
- Produces: `is_public_url(url: str) -> bool` in `scraper.py`. `scrape_url(url, timeout=15)` keeps its return shape. `build_guide_context(game: Game, budget_seconds=45, max_links=5, per_link_chars=20000) -> tuple[str, list[int]]`, returning prompt text and the source ids used.

- [ ] **Step 1: Write failing tests**

`test_scraper.py`, patching `socket.getaddrinfo` and the session, no real network:
- `test_refuses_internal_addresses`: `127.0.0.1`, `10.0.0.5`, `192.168.1.1`, `169.254.169.254`, `::1`, plus `db` resolving to `172.18.0.2`, all return False.
- `test_refuses_non_default_ports_and_schemes`: `http://example.com:8080/` and `ftp://example.com/` return False.
- `test_redirect_to_internal_is_refused`: a 302 to `http://169.254.169.254/` gives `content` None and no second fetch of that address.
- `test_stops_after_3_redirects`, `test_refuses_over_5mb`, `test_refuses_non_html` (`application/pdf`).

`test_guide_context.py`, patching `scrape_url`:
- `test_uses_up_to_5_links_and_skips_youtube`.
- `test_fresh_content_is_not_rescraped` (under 7 days) and `test_stale_content_is_rescraped` (over 7 days).
- `test_failed_rescrape_keeps_old_content`, `test_unreadable_link_is_skipped`.
- `test_each_link_capped_at_20000_chars`.
- `test_budget_stops_scraping`: with `budget_seconds=0`, no scrape runs, and stored content is still used.
- `test_text_is_marked_untrusted`: output contains the instruction not to follow anything written in the pages.
- In `test_access.py`: `test_editing_url_clears_scraped_content`: PUT with a new `url` sets `scraped_content` and `last_scraped` to None.

- [ ] **Step 2: Run; they fail**

- [ ] **Step 3: Implement**

`scrape_url` fetches with `allow_redirects=False` and `stream=True`, checks `is_public_url` before each hop, follows at most 3, reads up to 5 MB, and accepts only `text/html`, `application/xhtml+xml` and `text/plain`. Reduce `Retry(total=...)` to 1 so the budget holds. Compare `last_scraped` as naive UTC, because MySQL returns naive values. Add the IP-pinning `shortcut:` comment here and the shared-links one in `guide_context.py`. In `ai.py`, tips combine the Stardew wiki text and `build_guide_context`, under a generic "Reference Materials" heading.

- [ ] **Step 4: Run backend tests; all pass**

- [ ] **Step 5: Commit** `feat: read saved guide links when writing tips`

---

### Task 4: One-button library sync

**Files:**
- Modify: `backend/app/services/steam_api.py` (`get_owned_games`), `backend/app/routes/sync.py`, `frontend/src/services/api.js` (if needed), `frontend/src/pages/DashboardPage.jsx`, `frontend/src/components/GameCard.jsx`, `frontend/src/utils/stats.js`
- Create: `frontend/src/utils/librarySync.js`, `frontend/src/utils/librarySync.test.js`
- Test: `backend/tests/test_sync.py`, `frontend/src/utils/stats.test.js`

**Interfaces:**
- Produces: `POST /api/sync/games` adds `achievement_app_ids: number[]`. `runLibrarySync(appIds, syncOne, { onProgress, shouldStop }) -> Promise<{ total, done, failed, stopped: null | 'rate_limited' | 'private' | 'left' }>` in `librarySync.js`, with `onProgress(current, total)`.

- [ ] **Step 1: Check `has_community_visible_stats` against real data (read-only).** Inside the backend container, read the owner's `steam_id` with a SELECT, call `GetOwnedGames`, and compare the flag with `GetSchemaForGame` for at least 10 flagged-false games and any existing rows with achievements. If any false-flagged game has achievements, or the field is missing, `achievement_app_ids` includes every game and nothing is skipped. Record the result in the PR description.

- [ ] **Step 2: Write failing tests**

Backend:
- `test_sync_games_lists_only_games_with_stats`: flag True is in `achievement_app_ids`, flag False isn't, and its total becomes 0.
- `test_sync_games_marks_unchecked_as_null`: a new flagged game, and an existing row at 0, both end at `None`. A row with 12 keeps 12.
- `test_empty_schema_records_zero`: `sync_achievements` with an empty schema sets total to 0, status 200.
- `test_failure_leaves_total_null`.

Frontend `librarySync.test.js`:
- `test: reports progress as "current of total"`, sequentially (a `syncOne` tracking concurrency never exceeds 1).
- `test: one failure doesn't stop the rest`, with `done: 2, failed: 1`.
- `test: 429 stops with stopped 'rate_limited'`, not calling later games.
- `test: 403 stops with stopped 'private'`.
- `test: shouldStop() true stops with stopped 'left'`.

`stats.test.js`: `inProgress` excludes a game with `total_achievements === 0` and keeps one with `null`.

- [ ] **Step 3: Run; they fail**

- [ ] **Step 4: Implement**

`get_owned_games` adds `has_stats`. In `sync_games`, after the game is flushed: `if not game.total_achievements: game.total_achievements = None if g['has_stats'] else 0`. Set it after the flush, because the ORM otherwise applies the column default in place of `None`.

Dashboard: after `syncGames`, run the loop, with the button reading "Syncing 12 of 63" in an `aria-live="polite"` region, and refresh with `loadData()` only at the end, so the page stays usable. A ref set on unmount drives `shouldStop`. Exact end copy:
- `Synced 60 of 63. 3 couldn't be loaded; press Sync to try again.`
- Rate limited: `Steam asked us to slow down. Try again later.`
- Private: `Steam returned no achievements. Make sure your game details are public in Steam's privacy settings.`

GameCard: `null` keeps "Not synced yet", `0` shows "No achievements". Update the hint at `DashboardPage.jsx:165`.

- [ ] **Step 5: Run both suites and `docker compose build frontend`; all pass**

- [ ] **Step 6: Verify in the browser** with a throwaway player: the progress count moves, and a card shows each label. Delete the throwaway data.

- [ ] **Step 7: Commit** `feat: sync achievements for the whole library`

---

### Task 5: Route API

**Files:**
- Modify: `backend/app/routes/ai.py`, `frontend/src/services/api.js`
- Create: `backend/app/services/route_builder.py`, `backend/tests/test_route_builder.py`, `backend/tests/test_routes_api.py`
- Docs: `CLAUDE.md` endpoints and "Not built yet", `backend/backend-README.md`

**Interfaces:**
- Consumes: `generate_text`, `build_guide_context`, `owns_game`.
- Produces: `validate_route(raw: dict, achievements: list[Achievement]) -> dict`. `GET /api/ai/routes/<game_id>` and `POST` return `{ game_id, route: { message, shape, branches }, model_used, source_ids_used, updated_at }`. `aiAPI.getRoute(gameId)` and `aiAPI.generateRoute(gameId)` replace the broken names.

- [ ] **Step 1: Write failing tests**

`test_route_builder.py`:
- `test_drops_unknown_api_names`, `test_duplicates_keep_first_position`.
- `test_missing_go_to_other_most_common_first`: last branch named `Other`, `kind: 'side'`, ordered by `global_percent` descending.
- `test_invalid_branches_from_becomes_null`, `test_branches_from_must_be_a_main_step`.
- `test_story_without_main_promotes_first_branch` and `test_story_keeps_one_main`.
- `test_empty_branches_removed`, `test_unknown_shape_becomes_themed`.
- `test_long_branch_name_capped_at_40_chars`, `test_missable_note_only_kept_when_missable`.

`test_routes_api.py`, patching `generate_text`:
- `test_routes_need_login` and `test_game_must_be_in_library` (404 for both verbs).
- `test_get_without_route_is_404`, `test_get_with_corrupt_json_is_404`.
- `test_post_without_achievements_is_400`.
- `test_post_saves_and_get_returns_parsed`.
- `test_second_post_replaces_row`: `OptimizationRoute.count() == 1`.
- `test_invalid_json_retries_once`: first bad, second good gives 200, `generate_text` called twice.
- `test_invalid_twice_is_502_and_keeps_old_route`.
- `test_routes_are_per_player`.

- [ ] **Step 2: Run; they fail**

- [ ] **Step 3: Implement**

Prompt contents, ordering rules and the missable rule come from the spec. Pass the JSON shape from the spec as `response_schema`. `max_output_tokens = min(60000, 2048 + 60 * achievement_count)`. Store `json.dumps(validated)` in `summary_md`, source ids in `source_ids_used`, `model_name()` in `model_used`. Add the rate-limit and generation-in-request `shortcut:` comments.

- [ ] **Step 4: Run backend tests; all pass**

- [ ] **Step 5: Verify with a large game.** Find a game over 200 achievements with an app_id not in the DB, add it for a throwaway player, sync, and POST. Expected: 200 in under 120 s with every achievement placed. If it fails, reduce the output or raise the limit, and record the numbers. Delete the throwaway data.

- [ ] **Step 6: Commit** `feat: add the achievement route API`

---

### Task 6: Achievement map page

**Files:**
- Rewrite: `frontend/src/pages/OptimizationPage.jsx`
- Modify: `frontend/src/pages/GameDetailPage.jsx` (one link), `frontend/src/components/AchievementPanel.jsx` (optional `missableNote` prop, shown as a warning above the guide; the game page doesn't pass it), `frontend/src/index.css` (map animation classes only), `frontend/frontend-README.md`
- Create: `frontend/src/utils/routeTree.js`, `frontend/src/utils/routeTree.test.js`, `frontend/src/components/RouteTree.jsx`

**Interfaces:**
- Consumes: `aiAPI` from Task 5; `AchievementPanel({ achievement, unlocked, unlockTime, game, open, onClose })`; `achievementsAPI`, `playerAchievementsAPI`, `gamesAPI`.
- Produces: `buildRouteView(route, achievements, unlockedIds) -> { message, shape, branches: [{ name, kind, branchesFrom, steps: [{ achievement, state: 'done'|'next'|'later', missable, missableNote }] }], done, total }`. `visibleSteps(steps, expanded, nextCount = 3) -> { shown, hiddenCount }`. `layoutTree(view, expandedNames) -> { nodes: [{ apiName, x, y }], links: [{ d, state }], labels, moreButtons, width, height }`.

- [ ] **Step 1: Show the owner a story-layout mockup and get approval before going further.** Save it as `docs/superpowers/specs/mockups/route-tree-story.html`, in the same style as `route-tree-v2.html`, with real Steam icons from a story game. Stop if it isn't approved.

- [ ] **Step 2: Write failing tests** in `routeTree.test.js`:
- `next is the first unfinished step per branch`, and later ones are `later`.
- `state comes from unlockedIds, not the route`.
- `achievement added after the route was saved appears in Other`.
- `achievement removed from the game disappears`, with `total` matching.
- `visibleSteps shows the last done step and the next 3`, with `hiddenCount` counting the rest.
- `visibleSteps expanded shows everything` with `hiddenCount` 0.
- `short branches have no hidden count`.
- `themed: each branch gets its own column`, and no two nodes overlap at 200 steps in 6 branches.
- `story: side branch starts level with its branchesFrom step`, and a null one starts at the top.
- `expanding a branch grows height`.

- [ ] **Step 3: Run; they fail**

- [ ] **Step 4: Implement the utils; tests pass**

- [ ] **Step 5: Implement the page and `RouteTree.jsx`**

Follow the mockup, with every colour from existing tokens. Nodes are `<button>`s with visible focus and an accessible name including the state. Icons use `icon_gray_url` for later and `icon_url` otherwise, with the initial-letter fallback from `AchievementPanel`. The tree scrolls sideways inside its own container. "Long" branches use a real button for `+N more`. Missable nodes show a warning shown by icon and text, not colour alone. Exact copy:
- Empty: button `Map this game`.
- Generating: `Mapping your achievements… this can take up to a minute.`
- Not synced: `Sync this game's achievements first`, linking to the game page.
- Label: `This route is written by AI and can be wrong.`
- Existing route: button `Rewrite`.

A failed generation shows the server's error with `Try again`, keeping any old route on screen, and Rewrite is disabled while generating. Remove all `prose-*` classes. Add `View route` to the game page near its header; nothing else there changes.

- [ ] **Step 6: Run the frontend suite and `docker compose build frontend`; all pass**

- [ ] **Step 7: Verify in the browser** with throwaway data: both themes, a themed game and a story game, a 200-achievement game with `+N more`, phone width (no page-level sideways scroll), keyboard-only use, the drawer writing a guide, and reduced motion. Delete the throwaway data.

- [ ] **Step 8: Commit** `feat: add the achievement map page`

---

### Final: Whole-project check

- [ ] Run both suites and `docker compose up -d --build`. Confirm http://localhost:3100 loads and `/api/health` responds.
- [ ] Get a fresh review of the whole branch stack against the spec and this plan's Review Focus. Fix findings on the owning branch.
- [ ] Ask the owner to run their real Steam sign-in → Sync → map check. This is the first run on player id 2's data, so it's theirs to start.
