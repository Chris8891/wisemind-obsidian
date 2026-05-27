import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/postcss';
import vue from '@vitejs/plugin-vue';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const syncObsidian = process.env.WISEMIND_OBSIDIAN_SYNC === '1';
const syncPluginDir =
  process.env.WISEMIND_OBSIDIAN_PLUGIN_DIR ??
  '/Users/wangpingan/leo/obsidian_lib/.obsidian/plugins/wisemindai';
const syncFiles = ['main.js', 'styles.css', 'manifest.json', 'versions.json'];

const syncToObsidian = async () => {
  await mkdir(syncPluginDir, { recursive: true });
  await Promise.all(syncFiles.map(file => copyFile(join('dist', file), join(syncPluginDir, file))));
  const manifestPath = join(syncPluginDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const pluginDirName = basename(syncPluginDir);
  if (pluginDirName && manifest.id !== pluginDirName) {
    manifest.id = pluginDirName;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  console.log(`WiseMindAI Obsidian 已同步到：${syncPluginDir}`);
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
              console.error('WiseMindAI Obsidian 同步到 Obsidian 插件目录失败。');
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
    emptyOutDir: false,
    lib: {
      entry: 'src/main.ts',
      formats: ['cjs'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      external: ['obsidian', 'node:fs/promises'],
      output: {
        exports: 'default',
        assetFileNames: assetInfo => assetInfo.name === 'style.css' ? 'styles.css' : '[name][extname]',
      },
    },
  },
});
