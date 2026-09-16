import { defineConfig } from 'tsdown';

// Browser half of the plugin. The DSH web client loads plugin bundles as classic
// scripts through the global module loader; the factory receives the loader's
// `require` so @deepseek-ai/* platform modules stay external and are resolved by
// the host at runtime rather than duplicated into the bundle.
// Handshake rule (mainline system.ts:135): the stamped banner id must equal the
// package.json name, or the boot-graph row keyed by package name never sees a
// registered factory and client-module loading throws. Keep this literal in
// lockstep with scripts/assert-client-banner-handshake.mjs, wired into `pnpm build`.
const LOADER_ID = 'dsh-autopilot';

export default defineConfig({
  entry: { client: 'src/client/index.ts' },
  outDir: 'dist',
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  minify: false,
  sourcemap: false,
  dts: false,
  external: [/^@deepseek-ai\//, /^react($|\/)/, /^react-dom($|\/)/],
  banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(LOADER_ID)}, factory: function (require, module, exports) {\n`,
  footer: `\n} });`,
});
