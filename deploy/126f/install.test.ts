import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./install.sh", import.meta.url), "utf8");
const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { packageManager?: string };

test("pins and verifies the dashboard runtimes", () => {
  expect(source).toContain("bun_version=1.3.14");
  expect(source).toContain("pocketbase_version=0.30.4");
  expect(source).toContain("951ee2aee855f08595aeec6225226a298d3fea83a3dcd6465c09cbccdf7e848f");
  expect(source).toContain("d62a9247e775c59fa1ef5154f43a0bd868c6bfb2bcee5cdeef05cf14f657bc83");
  expect(source).toContain("sha256sum -c");
  expect(packageJson.packageManager).toBe("bun@1.3.14");
});

test("accepts a verified runtime cache and bounds direct GitHub downloads", () => {
  expect(source).toContain('runtime_cache_dir=${DASHWISE_RUNTIME_CACHE_DIR:-}');
  expect(source).toContain('local cache_file=${4:-}');
  expect(source).toContain('cp -- "${cache_file}" "${output}"');
  expect(source).toContain("--ipv4");
  expect(source).toContain("--connect-timeout 15");
  expect(source).toContain("--max-time 900");
  expect(source).toContain('"${runtime_cache_dir:+${runtime_cache_dir}/bun-linux-x64.zip}"');
  expect(source).toContain('"${runtime_cache_dir:+${runtime_cache_dir}/pocketbase_linux_amd64.zip}"');
});

test("can route only Git network operations through the server proxy", () => {
  expect(source).toContain('git_proxy_url=${DASHWISE_GIT_PROXY_URL:-}');
  expect(source).toContain('git_network_args+=(-c "http.proxy=${git_proxy_url}")');
  expect(source).toContain('git "${git_network_args[@]}" ls-remote');
  expect(source).toContain('git "${git_network_args[@]}" clone');
});

test("can deploy an exact commit from a verified source archive", () => {
  expect(source).toContain('source_archive=${DASHWISE_SOURCE_ARCHIVE:-}');
  expect(source).toContain('source_archive_sha256=${DASHWISE_SOURCE_ARCHIVE_SHA256:-}');
  expect(source).toContain(".dashwise-source-commit");
  expect(source).toContain('tar -xzf "${source_archive}" -C "${source_dir}"');
  expect(source).toContain('printf \'%s  %s\\n\' "${source_archive_sha256}" "${source_archive}" | sha256sum -c -');
  expect(source).toContain('remote_commit=$(<"${source_dir}/.dashwise-source-commit")');
});

test("runs the dashboard as a locked-down dedicated user", () => {
  expect(source).not.toContain("node-gyp");
  expect(source).toContain('export PATH="${bin_root}:${PATH}"');
  expect(source).toContain('"${bin_root}/bun" install --frozen-lockfile --ignore-scripts');
  expect(source).toContain("User=dashwise");
  expect(source).toContain("Group=dashwise");
  expect(source).toContain("ProtectSystem=strict");
  expect(source).toContain("ProtectHome=true");
  expect(source).toContain("NoNewPrivileges=true");
  expect(source).toContain("ReadWritePaths=/var/lib/dashwise");
  expect(source).toContain("PB_LISTEN_ADDRESS=127.0.0.1:8090");
  expect(source).toContain("HOST=::");
});

test("deploys immutable releases without destructive git operations or embedded login secrets", () => {
  expect(source).toContain("codex/126f-liquid-dashboard");
  expect(source).toContain("/opt/dashwise-126f/releases/");
  expect(source).not.toContain("git reset --hard");
  expect(source).not.toMatch(/(?:dashboard_password|sudo_password)=["'][^"']+["']/i);
  expect(source).toContain("install -m 0640");
});

test("seeds Tailnet-only LAN console links without embedding the NetAlertX token", () => {
  expect(source).toContain(
    "HOME_SERVER_NETALERTX_URL=https://zhou12600kf.tailb8f499.ts.net:20211/",
  );
  expect(source).toContain(
    "HOME_SERVER_ROUTER_URL=https://zhou12600kf.tailb8f499.ts.net:12443/",
  );
  expect(source).not.toMatch(/HOME_SERVER_NETALERTX_TOKEN=[A-Za-z0-9_-]+/);
});

test("quarantines incomplete releases and only rolls back to a different completed release", () => {
  expect(source).toContain('release_marker=${release_dir}/.dashwise-release-complete');
  expect(source).toContain('mv -- "${release_dir}" "${failed_release_dir}"');
  expect(source).toContain('touch "${source_dir}/.dashwise-release-complete"');
  expect(source).toContain('rm -f -- "${release_marker}"');
  expect(source).toContain('[[ ${candidate_target} != "${release_dir}" && -f ${candidate_target}/.dashwise-release-complete ]]');
});
