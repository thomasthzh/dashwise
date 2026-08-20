# Dashboard Loading Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce cold-load and component-readiness latency across the public and authenticated 126f dashboard without reducing visual or functional quality.

**Architecture:** Keep the existing dashboard design and live-data contracts, but create a narrow core-home bundle, lazily load non-home features, eliminate duplicate React trees and requests, make Geist non-blocking, and apply immutable caching only to content-addressed assets. Each behavior change is protected by a focused Bun test or a deterministic build/browser assertion before deployment.

**Tech Stack:** Bun, React 19, React Router, TanStack Query, Vite 8, Hono, TypeScript, Playwright.

---

### Task 1: Static asset cache policy

**Files:**
- Create: `apps/backend/src/features/static-assets/static-asset-cache.ts`
- Create: `apps/backend/src/features/static-assets/static-asset-cache.test.ts`
- Modify: `apps/backend/src/index.ts`

- [ ] **Step 1: Write the failing cache-policy tests**

Test `resolveStaticResponseHeaders()` with a hashed JS path, an unhashed background video, a font, and SPA HTML. Require one-year immutable caching only for hashed `/assets/*` and fonts, and require `text/html; charset=utf-8` plus `no-cache` for HTML.

- [ ] **Step 2: Run the focused test and verify RED**

Run `bun test apps/backend/src/features/static-assets/static-asset-cache.test.ts`. Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure policy and wire it into static serving**

Export a pure function returning `Content-Type` and optional `Cache-Control`. Detect Vite hashes with a filename segment of at least eight alphanumeric, underscore, or hyphen characters before the extension. Use the function in `servePublicFile()` and return SPA HTML through an explicit `Response` with HTML/no-cache headers.

- [ ] **Step 4: Run the focused test and backend typecheck**

Run `bun test apps/backend/src/features/static-assets/static-asset-cache.test.ts` and `bun x tsc -p apps/backend/tsconfig.json --noEmit`. Expected: all pass.

- [ ] **Step 5: Commit**

Commit as `perf: cache content-addressed dashboard assets`.

### Task 2: Stable authenticated tree and validation policy

**Files:**
- Create: `apps/web/src/lib/authValidationPolicy.ts`
- Create: `apps/web/src/lib/authValidationPolicy.test.ts`
- Modify: `apps/web/src/components/AuthWrapper.tsx`

- [ ] **Step 1: Write failing validation-policy tests**

Require an available token to validate once, require a token returned by the successful validation to be skipped on the immediate state update, and require a genuinely different later token to validate.

- [ ] **Step 2: Run the focused test and verify RED**

Run `bun test apps/web/src/lib/authValidationPolicy.test.ts`. Expected: FAIL because the policy module does not exist.

- [ ] **Step 3: Implement and use the policy**

Add `shouldValidateAuthToken(token, validatedReplacementToken)` and use a ref in `AuthWrapper`. Remove `isMounted`, its effect, and the provisional provider tree. Mark the returned token in the ref before `setAuth`, retain the invalid-token logout path, and render one stable `LocalizationProvider > ActivityProvider` hierarchy whenever a token exists.

- [ ] **Step 4: Verify policy and source behavior**

Run the focused test, frontend typecheck, and ESLint on the changed files. Confirm `AuthWrapper.tsx` has no `isMounted` branch.

- [ ] **Step 5: Commit**

Commit as `perf: keep authenticated dashboard tree stable`.

### Task 3: Shared page-config query

**Files:**
- Create: `apps/web/src/app/(authenticated)/dashboard/[page]/page.test.ts`
- Modify: `apps/web/src/app/(authenticated)/dashboard/[page]/page.tsx`

- [ ] **Step 1: Write a failing source-boundary regression test**

Read the page module and require it to call `usePageConfig({ pageName })`; reject direct imports/calls of `getPageConfigAction`, `useEffect`, and local loading/config state.

- [ ] **Step 2: Run the focused test and verify RED**

Run the new Bun test. Expected: FAIL because the page still owns a manual request effect.

- [ ] **Step 3: Replace manual fetching with `usePageConfig`**

Use `{ pageConfig, loading } = usePageConfig({ pageName })`; preserve the existing not-found condition and pass the shared result to `DashboardLayoutTemplate`.

- [ ] **Step 4: Verify the focused test and frontend typecheck**

Run the new test and `bun x tsc -p apps/web/tsconfig.json --noEmit`. Expected: pass.

- [ ] **Step 5: Commit**

Commit as `perf: deduplicate dashboard page configuration`.

### Task 4: On-demand command palette

**Files:**
- Modify: `apps/web/src/lib/publicInteractionAccess.ts`
- Modify: `apps/web/src/lib/publicInteractionAccess.test.ts`
- Modify: `apps/web/src/components/widgets/SearchBar.tsx`

- [ ] **Step 1: Add a failing closed-palette policy test**

Add `shouldRenderCommandBar(open, disabled)` expectations: false while closed, false in read-only mode, and true only when open and enabled.

- [ ] **Step 2: Run the focused test and verify RED**

Run `bun test apps/web/src/lib/publicInteractionAccess.test.ts`. Expected: FAIL because the render policy is absent.

- [ ] **Step 3: Lazy-load and conditionally mount `CommandBar`**

Replace the static import with `lazy(() => import('./CommandBar'))`, render it inside `Suspense fallback={null}` only when the policy permits, and preserve focus, global shortcut, default-open, search-query, and read-only behavior.

- [ ] **Step 4: Verify test, typecheck, and source import boundary**

Run the focused test and frontend typecheck. Confirm no static `CommandBar` import remains.

- [ ] **Step 5: Commit**

Commit as `perf: load command palette on demand`.

### Task 5: Core and deferred widget bundles

**Files:**
- Create: `apps/web/src/lib/widgetLoadPolicy.ts`
- Create: `apps/web/src/lib/widgetLoadPolicy.test.ts`
- Create: `apps/web/src/components/widgets/DeferredWidget.tsx`
- Modify: `apps/web/src/components/widgets/Widget.tsx`

- [ ] **Step 1: Write failing widget-tier tests**

Require clock, search, progress, shortcuts, home-server variants, and placeholder to resolve as core. Require calendar, RSS, latest-links, countdown, link-view, iframe, and unknown integration keys to resolve as deferred.

- [ ] **Step 2: Run the focused test and verify RED**

Run `bun test apps/web/src/lib/widgetLoadPolicy.test.ts`. Expected: FAIL because the policy module does not exist.

- [ ] **Step 3: Move non-core widget implementations behind one lazy boundary**

Create `DeferredWidget` containing the existing calendar, RSS, latest-link, countdown, iframe, link-view, and generic integration behavior. Keep the public `WidgetProps` contract in `Widget.tsx`, lazy-import the deferred module, and use a layout-stable frosted loading fallback. Do not change widget inputs or output styling.

- [ ] **Step 4: Verify tests, typecheck, and bundle output**

Run the focused test, frontend typecheck, and `bun x vite build --manifest` from `apps/web`. Inspect `.vite/manifest.json`: the core Widget chunk must be materially smaller than 772 KB decoded, and LinkView/integration dependencies must live in a dynamic chunk.

- [ ] **Step 5: Commit**

Commit as `perf: defer non-home widget implementations`.

### Task 6: Non-blocking typography and connection hints

**Files:**
- Create: `apps/web/src/lib/initialDocumentPerformance.test.ts`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/index.html`

- [ ] **Step 1: Write a failing document-performance test**

Read both files. Reject a Google Fonts CSS `@import`; require preconnect hints for `fonts.googleapis.com`, `fonts.gstatic.com`, and `api.iconify.design`; require an asynchronous Geist stylesheet link with a no-script fallback.

- [ ] **Step 2: Run the focused test and verify RED**

Run the new Bun test. Expected: FAIL on the existing blocking `@import` and missing hints.

- [ ] **Step 3: Move Geist loading into non-blocking HTML markup**

Remove the CSS import. Add the three preconnects and load the exact Geist family URL through `media="print"` plus `onload` promotion to `all`, with an equivalent `<noscript>` stylesheet. Keep the existing font-family design tokens.

- [ ] **Step 4: Verify the focused test and production build**

Run the focused test and the Vite production build. Expected: pass with no missing style or HTML errors.

- [ ] **Step 5: Commit**

Commit as `perf: make dashboard typography non-blocking`.

### Task 7: Full regression, deployment, and performance comparison

**Files:**
- Modify only if verification exposes a regression.

- [ ] **Step 1: Run repository verification**

Run focused Bun tests, frontend/backend no-emit typechecks, ESLint on changed TypeScript/TSX, `git diff --check`, and the Vite production build. Expected: zero failures; the existing size warning is acceptable only if the initial Widget chunk is below baseline.

- [ ] **Step 2: Run local browser regression**

Using bundled Playwright because the configured browser skill runtime and Chrome DevTools MCP are unavailable, test public and authenticated desktop/mobile pages. Require the correct page identity, ocean video playback, live cards, zero console/page errors, no closed-palette request, and successful Ctrl/Cmd+K opening.

- [ ] **Step 3: Commit and push the verified release**

Commit any verification-only corrections, ensure a clean tree, and push `codex/126f-liquid-dashboard`.

- [ ] **Step 4: Deploy through the existing atomic 126f release workflow**

Build the canonical source, web, delete, and source manifests; upload to the server cache; run the guarded deployment script; validate the release marker, systemd services, public health endpoints, and Cloudflare hostname. Do not alter firewall policy.

- [ ] **Step 5: Repeat the baseline measurement**

Run the same cache-disabled, service-worker-blocked Playwright measurement against public `/` and authenticated `/home`. Compare TTFB, FCP, LCP, shell readiness, live-card readiness, request count, own-origin transfer, validation/page-config counts, and initial Widget bytes.

- [ ] **Step 6: Capture final evidence and clean temporary files**

Capture desktop and mobile authenticated screenshots plus a search-open screenshot, remove temporary scripts and release artifacts, verify the repository remains clean, and report deterministic wins separately from network variance.
