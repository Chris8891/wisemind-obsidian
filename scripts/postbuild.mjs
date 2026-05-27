import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const outDir = 'dist';
await mkdir(outDir, { recursive: true });
await Promise.all([
  copyFile('manifest.json', join(outDir, 'manifest.json')),
  copyFile('versions.json', join(outDir, 'versions.json')),
]);

const mainPath = join(outDir, 'main.js');
const main = await readFile(mainPath, 'utf8');
await writeFile(mainPath, main.replace(/\n\/\/# sourceMappingURL=.*$/u, '\n'));
