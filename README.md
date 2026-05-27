## 开发阶段

在项目根目录运行 `pnpm dev:obsidian` ，然后回到 Obsidian 插件页面刷新插件列表，重启插件即可。

## 发布生产

在项目根目录运行 `pnpm release:obsidian`，会在 `packages/wisemindai-obsidian/dist` 生成一个文件夹和压缩包。

然后将文件夹的文件都复制到 `/Users/wangpingan/leo/ai/wisemindai-sync/` 根目录，然后用 git push 上去。

回到 https://github.com/Chris8891/wisemindai-obsidian/releases 创建一个新的 release，名称是版本号，比如 0.2.4 ，要跟 `packages/wisemindai-obsidian/manifest.json` 上面的版本号一致。

这个 release 要上传 `packages/wisemindai-obsidian/dist` 的压缩包和文件夹里面的所有文件。
