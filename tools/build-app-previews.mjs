import {spawnSync} from 'node:child_process';
import {cp, mkdir, readFile, stat, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root = resolve(import.meta.dirname, '..');
const project = resolve(root, 'apps/mobile_app');
const output = resolve(root, 'artifacts/app-previews');
const flutter = process.env.FLUTTER_BIN || 'flutter';
const pagesOnly = process.argv.includes('--pages-only');
await mkdir(output, {recursive: true});
for (const app of ['public', 'business']) {
  if (!pagesOnly) {
  const result = spawnSync(flutter, ['build', 'web', '--release', '--no-web-resources-cdn',
    `--target=lib/preview_${app}.dart`, `--base-href=/app-previews/${app}/`,
    '--dart-define=APP_BROWSER_PREVIEW=true'], {cwd: project, shell: process.platform === 'win32', stdio: 'inherit'});
  if (result.error || result.status !== 0) throw result.error || new Error(`${app} preview build failed`);
  await cp(resolve(project, 'build/web'), resolve(output, app), {recursive: true, force: true});
  }
  await stat(resolve(output, app, 'main.dart.js'));
  const html = await readFile(resolve(project, 'web/index.html'), 'utf8');
  await writeFile(resolve(output, app, 'index.html'), html.replace('$FLUTTER_BASE_HREF', `/app-previews/${app}/`));
}
await cp(resolve(root, 'preview-site/index.html'), resolve(output, 'index.html'));
await writeFile(resolve(output, 'release.json'), JSON.stringify({builtAt: new Date().toISOString(), mode: 'sample-only', apps: ['public', 'business']}, null, 2));
console.log('Both sample-only Flutter browser previews are ready in artifacts/app-previews.');
