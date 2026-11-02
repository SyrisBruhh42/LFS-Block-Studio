import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { build } from 'esbuild';
import type { Plugin, ResolvedConfig } from 'vite';
import { isStudioOfflinePath, studioOfflinePayload, STUDIO_OFFLINE_LIMITS, type StudioOfflineManifest } from '../src/lib/studioOfflineProtocol';

/** Post-build static inventory. Worker and its manifest are excluded from their own identity. */
export async function buildStudioOfflineCopy(outputDirectory: string, sourceRoot: string): Promise<StudioOfflineManifest> {
  const output = resolve(outputDirectory), paths: string[] = [];
  async function scan(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('Offline app output cannot contain symbolic links.');
      const path = resolve(directory, entry.name), name = relative(output, path).split(sep).join('/');
      if (entry.isDirectory()) { if (name === 'assets' || name.startsWith('assets/')) await scan(path); }
      else if (isStudioOfflinePath(name) && !name.endsWith('.map')) { if (paths.length >= STUDIO_OFFLINE_LIMITS.files) throw new Error('Offline file count exceeds 256.'); paths.push(name); }
    }
  }
  await scan(output);
  for (const required of ['index.html', 'manifest.webmanifest', 'icon.svg']) if (!paths.includes(required)) throw new Error(`Offline app output is missing ${required}.`);
  const entries = []; let total = 0;
  for (const path of paths) {
    const file = resolve(output, path), info = await stat(file); total += info.size;
    if (info.size > STUDIO_OFFLINE_LIMITS.fileBytes || total > STUDIO_OFFLINE_LIMITS.totalBytes) throw new Error('Offline files exceed the 16 MiB per-file or 32 MiB total budget.');
    const bytes = await readFile(file); if (bytes.length !== info.size) throw new Error('Offline output changed while its inventory was being built.');
    entries.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const payload = studioOfflinePayload(entries), manifest: StudioOfflineManifest = { ...payload, buildId: createHash('sha256').update(JSON.stringify(payload)).digest('hex') };
  const result = await build({ entryPoints: [resolve(sourceRoot, 'src/worker/studioOfflineWorker.ts')], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022', minify: true, sourcemap: false, define: { __STUDIO_OFFLINE_BUILD__: JSON.stringify(manifest) } });
  if (result.outputFiles.length !== 1) throw new Error('Offline worker build produced unexpected output.');
  await writeFile(resolve(output, 'sw.js'), result.outputFiles[0].contents);
  await writeFile(resolve(output, 'offline-build.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
export function studioOfflineBuildPlugin(): Plugin {
  let config: ResolvedConfig;
  return { name: 'vite-plugin-lfs-studio-offline-copy', apply: 'build', configResolved(value) { config = value; }, async closeBundle() {
    if (config.base !== '/') throw new Error('This Studio offline build is qualified for root hosting only.');
    await buildStudioOfflineCopy(resolve(config.root, config.build.outDir), config.root);
  } };
}
