import { execFile } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const outDir = 'dist';
const zipName = `${manifest.id}-${manifest.version}.zip`;

await mkdir(outDir, { recursive: true });
await execFileAsync('zip', ['-j', join(outDir, zipName), 'dist/main.js', 'dist/styles.css', 'dist/manifest.json', 'dist/versions.json']);
console.log(`Created ${join(outDir, zipName)}`);
