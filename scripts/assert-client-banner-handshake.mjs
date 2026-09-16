// TC-B3-33E client banner <-> package.json name handshake self-assert.
//
// Why: the mainline web client loads this package's browser half (dist/client.cjs)
// as a classic script and, after it executes, requires a factory registered under
// the boot-graph row id. The row id IS the package name
// (zDSH-main packages/client/modules/src/client/manifest.ts: "Entry name ==
// package name (module-table key)"), registration is keyed by the banner id with
// a trailing "/client" stripped (system.ts register() -> stripClientSuffix), and
// a missing key throws (system.ts:135 "bundle ... loaded without registering
// \"<id>\" via __ModuleLoader__.load"). The banner id is stamped from package
// name by the shared preset too (tsdown.client.ts JSDoc: "id - plugin id
// (package name), stamped into the __ModuleLoader__.load handoff"). So this
// standalone tsdown config must keep LOADER_ID equal to the package.json name
// — any package rename without a banner rebuild turns the future client mount
// red. Same coupling 31E closed for FileHub.
//
// Pure static comparison: reads dist/client.cjs head/tail bytes and package.json;
// no browser, no web server, no network. Wired into `pnpm build` (fail-closed:
// a drift makes the build fail, not a runtime surprise).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const distPath = path.join(ROOT, 'dist', 'client.cjs');
const dist = readFileSync(distPath, 'utf8');

/** Verbatim mirror of mainline stripClientSuffix (manifest.ts). */
function stripClientSuffix(spec) {
  return spec.endsWith('/client') ? spec.slice(0, -'/client'.length) : spec;
}

const results = [];
function assert(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

// 1. dist banner: the loader.load({ id }) registration line opens the bundle.
const bannerMatch = dist.match(
  /^window\.__ModuleLoader__\.load\(\{ id: "([^"]+)", factory: /,
);
assert(
  'handshake.banner-present',
  bannerMatch !== null,
  'dist/client.cjs must open with the ModuleLoader banner',
);

// 2. Registration key (banner id after /client stripping) must equal the boot
//    row id, i.e. the package.json name — the exact system.ts:135 criterion.
const bannerId = bannerMatch ? bannerMatch[1] : '';
const registrationKey = stripClientSuffix(bannerId);
assert(
  'handshake.banner-id-matches-package-name',
  registrationKey === pkg.name,
  `banner id "${bannerId}" -> key "${registrationKey}" vs package name "${pkg.name}"`,
);

// 3. Known legacy dead id must never come back (zdsh- prefix was the 33D rename
//    casualty; pin it so a revert of the config cannot silently pass).
assert(
  'handshake.no-legacy-zdsh-id',
  bannerId !== 'zdsh-autopilot' && !bannerId.startsWith('zdsh-'),
  `banner id "${bannerId}"`,
);

// 4. Source anchor: tsdown.config.ts LOADER_ID literal must carry the same name,
//    so "edited the config but shipped a stale dist" cannot pass either way.
const config = readFileSync(path.join(ROOT, 'tsdown.config.ts'), 'utf8');
const loaderIdMatch = config.match(/const LOADER_ID = '([^']+)';/);
assert(
  'handshake.config-loader-id-matches-package-name',
  loaderIdMatch !== null && loaderIdMatch[1] === pkg.name,
  loaderIdMatch === null ? 'LOADER_ID literal not found in tsdown.config.ts' : `LOADER_ID "${loaderIdMatch[1]}" vs package name "${pkg.name}"`,
);

// 5. Footer closes the registration, otherwise the factory never completes and
//    the module table treats the bundle as broken.
assert(
  'handshake.footer-tail',
  dist.trimEnd().endsWith('} });'),
  'dist/client.cjs must close with the module-loader footer',
);

const failed = results.filter((r) => !r.ok);
console.log(`[handshake] ${results.length - failed.length}/${results.length} assertions passed`);
if (failed.length > 0) {
  console.error('CLIENT_BANNER_HANDSHAKE=false');
  process.exit(1);
}
console.log('CLIENT_BANNER_HANDSHAKE=true');
