import {defineConfig} from 'vite';
import tailwindcss from '@tailwindcss/postcss';
import vue from '@vitejs/plugin-vue';
import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {basename, join} from 'node:path';

const syncObsidian = process.env.WISEMIND_OBSIDIAN_SYNC === '1';
const syncPluginDir =
  process.env.WISEMIND_OBSIDIAN_PLUGIN_DIR ??
  '/Users/wangpingan/leo/obsidian_lib/.obsidian/plugins/wisemindai';
const syncBuiltFiles = ['main.js', 'styles.css'];
const syncStaticFiles = ['manifest.json', 'versions.json'];

const syncToObsidian = async () => {
  await mkdir(syncPluginDir, {recursive: true});
  await mkdir('dist', {recursive: true});
  await Promise.all([
    ...syncBuiltFiles.map(file => copyFile(join('dist', file), join(syncPluginDir, file))),
    ...syncStaticFiles.flatMap(file => [
      copyFile(file, join('dist', file)),
      copyFile(file, join(syncPluginDir, file)),
    ]),
  ]);
  const manifestPath = join(syncPluginDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const pluginDirName = basename(syncPluginDir);
  if (pluginDirName && manifest.id !== pluginDirName) {
    manifest.id = pluginDirName;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  console.log(`WiseMindAI Obsidian synced to: ${syncPluginDir}`);
};

export default defineConfig({
  plugins: [
    vue(),
    syncObsidian
      ? {
          name: 'sync-wisemindai-obsidian-plugin',
          closeBundle: async () => {
            try {
              await syncToObsidian();
            } catch (error) {
              console.error('Failed to sync WiseMindAI Obsidian plugin.');
              console.error(error);
            }
          },
        }
      : null,
  ].filter(Boolean),
  css: {
    postcss: {
      plugins: [tailwindcss()],
    },
  },
  build: {
    sourcemap: false,
    emptyOutDir: true,
    lib: {
      entry: 'src/main.ts',
      formats: ['cjs'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      external: ['electron', 'obsidian', 'node:fs/promises'],
      output: {
        exports: 'default',
        inlineDynamicImports: true,
        assetFileNames: assetInfo =>
          assetInfo.name === 'style.css' ? 'styles.css' : '[name][extname]',
      },
    },
  },
});
