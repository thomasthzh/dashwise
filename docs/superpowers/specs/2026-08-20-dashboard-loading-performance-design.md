# Dashboard Loading Performance Design

## Goal

Make the public dashboard and authenticated home feel materially faster without reducing the ocean background quality, optical-glass surfaces, motion, icons, live data, or search capability.

## Measured baseline

Cold Chromium navigation with browser cache disabled, service workers blocked, and the same Cloudflare URL produced:

| Route | TTFB | FCP | LCP | shell ready | live cards ready | own-origin transfer |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Public `/` | 1,993 ms | 3,384 ms | 4,496 ms | 4,630 ms | 5,451 ms | 4,107 KB |
| Authenticated `/home` | 1,323 ms | 2,628 ms | 4,816 ms | 3,355 ms | 4,732 ms | 4,121 KB |

The server origin answered HTML and public status in about 2 ms. Most avoidable latency was therefore browser-side or multiplied by the Cloudflare path:

- the Google Fonts CSS import blocked first paint for about 1.15 seconds;
- `AuthWrapper` mounted the complete dashboard twice and validation ran again after token refresh;
- the dashboard page fetched page configuration outside the shared React Query cache;
- closed command bars mounted eagerly and issued duplicate frequently-used requests;
- the home widget entry chunk included calendars, RSS, link view, iframe, and the generic integration renderer, reaching 772 KB decoded;
- hashed Vite assets did not receive an application-level immutable cache policy;
- the 3.66 MB ocean video dominated bytes but loaded in under one second and is a required visual asset, so it is not degraded in this pass.

## Architecture

### 1. Preserve the visual layer while removing paint blockers

Geist remains the final typeface, but its remote stylesheet is loaded asynchronously from `index.html` after immediate system-font rendering. Preconnect hints cover Google Fonts, the font CDN, and Iconify. The background video, glass blur, gradients, animation timing, and service icons remain unchanged.

### 2. Keep one authenticated component tree

`AuthWrapper` renders a single provider hierarchy after confirming that a token exists. It no longer creates a temporary tree and replaces it on mount. A token returned by validation is marked before updating local auth state so the refreshed token is not immediately validated a second time. Unauthorized behavior and navigation remain unchanged.

### 3. Use one cache owner per resource

The authenticated dashboard page consumes `usePageConfig({ pageName })`, the same React Query resource already used by localization and dashboard children. This removes the manual effect and duplicate configuration request while preserving loading and not-found states.

### 4. Split core home code from deferred features

The initial widget module keeps only widgets needed by the 126f home path: clock, search trigger, progress, shortcuts, and home-server cards. Calendar, RSS, latest-links, countdown, link-view, iframe, and generic integration widgets move behind one lazy `DeferredWidget` boundary. The command palette is separately imported only when it opens. Suspense fallbacks preserve layout stability.

### 5. Cache only content-addressed assets permanently

Requests under `/assets/` whose filenames contain a Vite content hash receive `public, max-age=31536000, immutable`. Stable filenames such as the ocean video and service worker keep revalidation behavior. SPA HTML receives an explicit HTML content type and `no-cache` so a new release cannot strand clients on obsolete hashes.

## Quality and security boundaries

- Do not expose new ports or alter the Cloudflare/Tailscale access model.
- Do not cache authenticated or live API responses as immutable assets.
- Do not delay, posterize, recompress, or remove the default ocean background.
- Do not replace Iconify artwork with visually different local icons.
- Preserve keyboard search, public read-only behavior, invalid-token logout, page-not-found handling, and reduced-motion/transparency preferences.
- A release is accepted only after focused tests, typecheck/lint/build, desktop and mobile browser verification, clean console checks, and the same cold-load measurement used for the baseline.

## Success criteria

- No render-blocking Google Fonts `@import`.
- One authenticated validation request per mounted session token.
- One page-config request on `/home` cold load.
- No command-palette or deferred-widget chunk before the feature is used.
- The initial widget chunk is materially smaller than the 772 KB decoded baseline.
- Hashed assets advertise immutable caching while HTML remains revalidated.
- Public and authenticated live cards, ocean playback, optical glass, search opening, and responsive layouts still work.
- Component readiness improves by at least 25% in a same-method comparison, or any network variance is explicitly separated from deterministic wins.
