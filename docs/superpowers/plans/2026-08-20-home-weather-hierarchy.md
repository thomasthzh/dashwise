# 126f Home Weather Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the New York weather glanceable from the administrator clock and make the dual-city weather card materially easier to read without disturbing the dashboard skeleton.

**Architecture:** Keep the existing Open-Meteo data flow and React markup. Change only the weather-card CSS hierarchy, then transactionally remove the `weather` key from the current administrator `home` page configuration while preserving the rest of the config.

**Tech Stack:** React, TypeScript, Tailwind/global CSS, Bun, Vite, Hono/PocketBase pageConfig API, Playwright

---

### Task 1: Increase the dual-city weather hierarchy

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/src/components/widgets/HomeWeatherCard.test.tsx`

- [ ] **Step 1: Run the existing semantic component test**

Run:

```powershell
bun test apps/web/src/components/widgets/HomeWeatherCard.test.tsx
```

Expected: 2 tests pass before the visual-only change.

- [ ] **Step 2: Apply the bounded typography and spacing change**

Update only the `.home-weather-*` rules so the key values resolve approximately to:

```css
.home-weather-card { min-height: 174px; padding: 13px 14px 14px; }
.home-weather-card header { margin-bottom: 10px; font-size: .72rem; }
.home-weather-city__heading span { font-size: .68rem; }
.home-weather-city__heading small,
.home-weather-city__range { font-size: .5rem; }
.home-weather-city__current > iconify-icon { font-size: 1.28rem; }
.home-weather-city__current strong { font-size: 1.52rem; }
.home-weather-forecast { gap: 5px; margin-top: 9px; }
.home-weather-forecast > span { padding: 6px 3px; }
.home-weather-forecast small { font-size: .45rem; }
.home-weather-forecast iconify-icon { font-size: .63rem; }
.home-weather-forecast strong { font-size: .58rem; }
```

Keep both cities equal-width, retain the subtle divider, and preserve the existing mobile stack below 420px.

- [ ] **Step 3: Run focused code checks**

Run:

```powershell
bun test apps/web/src/components/widgets/HomeWeatherCard.test.tsx
bun x eslint apps/web/src/components/widgets/HomeWeatherCard.tsx apps/web/src/components/widgets/HomeWeatherCard.test.tsx --quiet
bun x -p vite@8.0.3 vite build --logLevel error
```

Expected: tests, ESLint, and production build exit 0.

- [ ] **Step 4: Commit the UI change**

```powershell
git add apps/web/src/app/globals.css
git commit -m "feat: enlarge dual-city weather card"
```

### Task 2: Remove the administrator clock weather

**Files:**
- Modify externally: authenticated `home` pageConfig record on `homepage.thomasthzh.top`

- [ ] **Step 1: Read and validate the exact current config**

Authenticate, GET `/api/v1/pageConfig?pageName=home`, and require:

```text
columns.middle.main-clock.glanceables.date exists
columns.middle.main-clock.glanceables.weather exists
```

Keep the complete response in memory for rollback.

- [ ] **Step 2: Write the smallest config mutation**

Clone the full config, delete only:

```text
columns.middle.main-clock.glanceables.weather
```

PUT `/api/v1/pageConfig` with `{ pageName: "home", config }` and the authenticated bearer token.

- [ ] **Step 3: Verify or roll back**

GET the config again and require `date` to remain and `weather` to be absent. If either condition fails, PUT the exact original config back and report failure.

### Task 3: Deploy and verify production

**Files:**
- Read: `ops/126f/deploy-dashwise-release.sh` from the existing operations worktree
- Temporary outside repo: release archives and Playwright QA script

- [ ] **Step 1: Push the branch and prepare a canonical release delta**

Push `codex/126f-liquid-dashboard`. Build the web app, generate the full source manifest from raw Git blobs using `git ls-tree` plus `git cat-file --batch`, and create the source delta against production release `493eb347d15b23aa9ffec10a03d93f22240766e7`.

- [ ] **Step 2: Run the atomic server deployer**

Stage exactly `source.tar`, `web.tar`, `delete.manifest`, and `source.manifest` under `/home/thzh/.cache/dashwise-deploy/<commit>`, then run the established root deployer. Require the release pointer, systemd service, and `/health` response to identify the new commit.

- [ ] **Step 3: Exercise the rendered target flow**

The flow under test is: administrator `/home` loads → the main clock contains no New York weather → the larger dual-city card renders two readable columns without clipping.

Use Browser first. If its known runtime file is still absent, record that invocation failure and use the bundled Playwright runtime. Check 1440×900 desktop and 390×844 mobile for page identity, nonblank content, framework overlay, console warnings/errors, computed weather typography, two-column/stacked layout, background playback, and clipping.

- [ ] **Step 4: Clean temporary artifacts and record final evidence**

Remove or zero only the exact temporary release/QA files created by this task. Confirm the Git worktree matches the pushed branch and the server journal has no new error-level entries.
