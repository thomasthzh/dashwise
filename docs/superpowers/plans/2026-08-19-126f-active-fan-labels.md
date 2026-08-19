# 126f Active Fan Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show only spinning fans in the authenticated 126f hardware card and label the live NCT6687 channels as CPU fan and chassis fan 1.

**Architecture:** Keep Linux collection and the private API unchanged. Filter and label fans in `resolveHardwarePanel`, guarded by the exact 126f board name, NCT6687 source, and generic kernel label. Generalize the manifest-bound atomic deployer so it accepts this legitimate source delta without weakening its full-tree identity checks.

**Tech Stack:** TypeScript, React 19 server rendering tests, Bun test, Python unittest, Bash, Vite, systemd, Cloudflare Tunnel.

---

## File structure

- Modify `apps/web/src/lib/homeServerPresentation.test.ts`: specify active-only filtering, exact-board labels, preserved non-generic labels, and truthful unknown channels.
- Modify `apps/web/src/components/widgets/HomeServerHostPanel.test.tsx`: verify administrator markup shows the two active physical labels and omits 0 RPM.
- Modify `apps/web/src/lib/homeServerPresentation.ts`: implement the single presentation-layer filter and exact-board mapping.
- Modify `ops/126f/test_deploy_dashwise_release.py` in the ops worktree: prove a manifest-valid non-hardware source delta is accepted.
- Modify `ops/126f/deploy-dashwise-release.sh` in the ops worktree: remove obsolete feature-specific archive requirements while retaining archive, manifest, dependency, generated-runtime, and final-tree validation.

### Task 1: Make the atomic deployer accept a generic manifest-bound delta

**Files:**
- Modify: `C:/Users/thoma/Documents/ChatGPT/126f服务器/.worktrees/ops-hardware-guide/ops/126f/test_deploy_dashwise_release.py`
- Modify: `C:/Users/thoma/Documents/ChatGPT/126f服务器/.worktrees/ops-hardware-guide/ops/126f/deploy-dashwise-release.sh`

- [ ] **Step 1: Write the failing behavior test**

Add a test whose source archive contains only a legitimate changed presentation file:

```python
def test_embedded_validator_accepts_a_generic_manifest_bound_source_delta(self):
    result = self.run_embedded_archive_validator([
        (
            "apps/web/src/lib/homeServerPresentation.ts",
            b"export const changed = true;\n",
            tarfile.REGTYPE,
        ),
    ])
    self.assertEqual(result.returncode, 0, result.stderr)
```

- [ ] **Step 2: Run the test and verify the expected red state**

Run:

```powershell
python -m unittest ops.126f.test_deploy_dashwise_release.DeployDashwiseReleaseTests.test_embedded_validator_accepts_a_generic_manifest_bound_source_delta -v
```

Expected: FAIL because the validator still reports that the source archive or manifest is missing the old hardware-feature-specific files.

- [ ] **Step 3: Remove only the obsolete feature-specific requirements**

In `validate_archives_and_manifest`, inspect the source archive with an empty required-file set and remove the `required_tracked` subset check:

```python
source_names = inspect(
    sys.argv[1],
    "source",
    set(),
    32 * 1024 * 1024,
)
```

Keep `inspect`'s non-empty archive requirement, `source_names.issubset(tracked)`, the manifest transition equality check, dependency identity guard, generated-output policy, and final source-tree validation unchanged.

- [ ] **Step 4: Run the focused and full ops suites**

Run:

```powershell
python -m unittest ops.126f.test_deploy_dashwise_release -v
python -m unittest discover ops/126f -p "test_*.py" -q
```

Expected: all deployer tests and all 126f ops tests pass.

- [ ] **Step 5: Commit the deployer change**

```powershell
git add -- ops/126f/deploy-dashwise-release.sh ops/126f/test_deploy_dashwise_release.py
git diff --cached --check
git commit -m "fix: accept generic manifest-bound releases"
```

### Task 2: Specify the active-only fan presentation

**Files:**
- Modify: `apps/web/src/lib/homeServerPresentation.test.ts`
- Modify: `apps/web/src/components/widgets/HomeServerHostPanel.test.tsx`

- [ ] **Step 1: Write the failing presentation test**

Use exact-board NCT6687 data with active `Fan 1`, inactive `Fan 2`, active `Fan 3`, active generic `Fan 5`, and active non-generic `Rear Exhaust`. Assert the resolved fan rows are exactly:

```typescript
fans: [
  { id: "fan-1", label: "CPU 风扇", rpm: 1264 },
  { id: "fan-3", label: "机箱风扇 1", rpm: 980 },
  { id: "fan-5", label: "风扇 5", rpm: 720 },
  { id: "fan-6", label: "Rear Exhaust", rpm: 640 },
]
```

- [ ] **Step 2: Write the failing component regression test**

Give the administrator snapshot active `Fan 1`, inactive `Fan 2`, and active `Fan 3`, then assert:

```typescript
expect(markup).toContain("CPU 风扇");
expect(markup).toContain("机箱风扇 1");
expect(markup).not.toContain("0 RPM");
expect(markup).not.toContain(">风扇 2<");
```

- [ ] **Step 3: Run both tests and verify the expected red state**

Run:

```powershell
bun test apps/web/src/lib/homeServerPresentation.test.ts apps/web/src/components/widgets/HomeServerHostPanel.test.tsx
```

Expected: FAIL because zero-RPM rows are still returned and generic labels are not board-aware.

### Task 3: Implement the minimal presentation-layer mapping

**Files:**
- Modify: `apps/web/src/lib/homeServerPresentation.ts`

- [ ] **Step 1: Filter and label in the existing fan pipeline**

Introduce only the exact board constant and extend the existing fan mapping:

```typescript
const HOME_SERVER_BOARD = "B760M GAMING PLUS WIFI DDR4 II (MS-7D99)";

fans: hardware.fans
  .filter((fan) => fan.rpm > 0)
  .map((fan) => {
    const generic = fan.label.match(/^fan\s*(\d+)$/i);
    let label = generic ? `风扇 ${generic[1]}` : fan.label;
    if (
      hardware.boardModel === HOME_SERVER_BOARD
      && /^nct6687$/i.test(fan.source)
      && generic
    ) {
      if (generic[1] === "1") label = "CPU 风扇";
      if (generic[1] === "3") label = "机箱风扇 1";
    }
    return { id: fan.id, label, rpm: fan.rpm };
  }),
```

- [ ] **Step 2: Run the two focused tests and verify green**

Run:

```powershell
bun test apps/web/src/lib/homeServerPresentation.test.ts apps/web/src/components/widgets/HomeServerHostPanel.test.tsx
```

Expected: both test files pass with no warnings.

- [ ] **Step 3: Run the feature regression gates**

Run the nine focused hardware/privacy test files, backend TypeScript 5.9 `--noEmit`, changed-file ESLint, and `bun x -p vite@8.1.3 vite build` from `apps/web`.

Expected: 0 test failures, typecheck and ESLint exit 0, and Vite produces a successful production build; the existing large-chunk warning may remain.

- [ ] **Step 4: Commit and push the Dashwise change**

```powershell
git add -- apps/web/src/lib/homeServerPresentation.ts apps/web/src/lib/homeServerPresentation.test.ts apps/web/src/components/widgets/HomeServerHostPanel.test.tsx
git diff --cached --check
git commit -m "feat: label active 126f fans"
git push origin codex/126f-liquid-dashboard
```

### Task 4: Package and atomically deploy the verified release

**Files:**
- Read: `.dashwise-source-manifest` from the current release
- Generate: commit-scoped `source.tar`, `web.tar`, `delete.manifest`, and `source.manifest` staging inputs

- [ ] **Step 1: Build trusted release inputs from the pushed commit**

Generate a full sorted SHA-256 source manifest from Git-tracked regular files, a source archive containing exactly the files changed since the deployed manifest, a deletion manifest containing exactly removed tracked paths, and a complete regular-file-only Web archive from `apps/web/dist`. Exclude generated output from the source manifest according to the deployer policy.

- [ ] **Step 2: Validate the local inputs before upload**

Confirm the source archive paths equal the manifest transition, the deletion list equals removed tracked paths, dependency metadata is byte-identical to the deployed release, and both archives contain only normalized regular-file paths.

- [ ] **Step 3: Upload into the exact commit staging directory and run the atomic deployer**

Use `/home/thzh/.cache/dashwise-deploy/<commit>` for the four user-owned inputs, upload the reviewed `deploy-dashwise-release.sh`, and invoke it through sudo. The script must materialize and validate the candidate before switching `/opt/dashwise-126f/current`, then pass systemd and local health checks.

- [ ] **Step 4: Verify runtime and privacy boundaries**

Confirm `dashwise-126f.service` is active with zero new restarts, `/health` succeeds, the public status endpoint remains cacheable and contains neither `hardware` nor `href`, and the unauthenticated private endpoint returns 401 with `private, no-store`.

### Task 5: Browser acceptance and independent review

**Files:**
- Verify: `https://homepage.thomasthzh.top/`

- [ ] **Step 1: Verify the authenticated desktop card**

Log in through the normal UI and assert the fan section contains exactly two live rows: `CPU 风扇` and `机箱风扇 1`; both RPM values are positive and no `0 RPM` text exists. Confirm temperatures, resource bars, the memory glow, and the hkvps peer row remain present.

- [ ] **Step 2: Verify the anonymous boundary**

Return to a clean anonymous context and confirm the public page has no hardware card, no management links, no protected status request, and no console errors.

- [ ] **Step 3: Request an independent final review**

Review the exact new Dashwise and ops commit ranges along Standards and Spec axes. Resolve every Critical or Important finding, rerun affected gates, and finish only when the reviewer reports `Ready to merge: Yes`.
