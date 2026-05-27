# WiseMindAI for Obsidian

WiseMindAI for Obsidian connects your Obsidian vault with the WiseMindAI desktop app. You can summarize notes, generate knowledge cards, chat with note content, send Markdown notes to WiseMindAI, and sync content between Obsidian and WiseMindAI.

## Requirements

- Obsidian desktop app.
- WiseMindAI desktop app.
- WiseMindAI local API enabled in the WiseMindAI app.

The plugin is desktop only because it connects to the local WiseMindAI service.

## Installation

1. Download the plugin release files: `main.js`, `styles.css`, and `manifest.json`.
2. Create this folder in your vault if it does not exist:

   ```text
   .obsidian/plugins/wisemindai/
   ```

3. Copy the three files into that folder.
4. Restart Obsidian or reload plugins.
5. Open **Settings -> Community plugins** and enable **WiseMindAI**.

## Connect to WiseMindAI

1. Open the WiseMindAI desktop app.
2. Enable the local API service in WiseMindAI settings.
3. In Obsidian, open **Settings -> WiseMindAI**.
4. Keep the default API address unless you changed it in WiseMindAI:

   ```text
   http://127.0.0.1:38221
   ```

5. Click **Test connection**. The status bar will show whether WiseMindAI is connected.

## Open the Plugin Panel

Use any of these entry points:

- Click the WiseMindAI ribbon icon in the left sidebar.
- Run **WiseMindAI: 打开面板** from the Obsidian command palette.
- Click the WiseMindAI status bar item.

The panel includes Home, Summary, Cards, Chat, Sync, Search, Settings, and Tutorial pages.

## Main Features

### Summarize Notes

Open a Markdown note, then choose **Summary** in the WiseMindAI panel. You can summarize the current note, selected text, or selected notes. After generation, you can copy the result, insert it into the current note, save it as a new Obsidian note, save it to WiseMindAI Notes, continue chatting, or generate cards from the summary.

You can also run these commands:

- **WiseMindAI: 总结当前笔记** - summarize the current note.
- **WiseMindAI: 总结选中文本** - summarize selected text.

### Generate Knowledge Cards

Open the **Cards** page to generate structured cards from a note or selected text. Choose the card count, difficulty, card type, deck, and folder. Generated cards can be saved to WiseMindAI Cards or inserted into the current note.

You can also run these commands:

- **WiseMindAI: 从当前笔记生成知识卡片** - generate cards from the current note.
- **WiseMindAI: 从选中文本生成知识卡片** - generate cards from selected text.

### Chat With Notes

Open the **Chat** page to ask questions about your current note or selected content. In chat, type `@` to mention notes from your vault.

### Rewrite Selected Text

Select text in the editor, then use the command palette or editor right-click menu to rewrite, expand, shorten, polish, or extract tags with WiseMindAI.

### Send Notes to WiseMindAI

Right-click a Markdown file or folder in Obsidian and choose where to send it:

- WiseMindAI Notes
- WiseMindAI Documents
- WiseMindAI Knowledge Base

You can also send selected text from the editor right-click menu.

### Sync Between Obsidian and WiseMindAI

Open the **Sync** page to move Markdown content in either direction:

- Obsidian -> WiseMindAI
- WiseMindAI -> Obsidian

You can select folders, choose targets, handle duplicate content, save sync plans, and review sync history.

### Search

Open the **Search** page to search across Obsidian notes and WiseMindAI local content.

## Settings

Open **Settings -> WiseMindAI** or the **Settings** page in the plugin panel. Common settings include:

- Language: follow Obsidian, Simplified Chinese, or English.
- API service URL.
- `@` note suggestion limit in chat.
- Default card count.
- Duplicate handling during sync: update, skip, or create a copy.
- Export and import plugin data backup.

## Troubleshooting

- If Obsidian shows **Cannot connect to WiseMindAI**, open the WiseMindAI desktop app and enable the local API service.
- If the connection still fails, confirm the API address in Obsidian matches the local API address in WiseMindAI.
- If a note does not appear in sync, make sure it is a Markdown file and is not inside `.obsidian` or `.trash`.
- If generated content is empty, check that the selected note or selected text has enough readable content.

---

# WiseMindAI Obsidian 插件

WiseMindAI Obsidian 插件可以把 Obsidian 本地仓库和 WiseMindAI 桌面端连接起来。你可以在 Obsidian 里总结笔记、生成知识卡片、围绕笔记对话、把 Markdown 笔记发送到 WiseMindAI，也可以在 Obsidian 和 WiseMindAI 之间同步内容。

## 使用前准备

- Obsidian 桌面端。
- WiseMindAI 桌面端。
- 已在 WiseMindAI 中开启本地 API 服务。

这个插件只支持桌面端，因为它需要连接 WiseMindAI 的本地服务。

## 安装

1. 下载插件发布文件：`main.js`、`styles.css`、`manifest.json`。
2. 在你的 Obsidian 仓库里创建下面的文件夹：

   ```text
   .obsidian/plugins/wisemindai/
   ```

3. 把三个文件复制到这个文件夹里。
4. 重启 Obsidian，或者重新加载插件。
5. 打开 **设置 -> 第三方插件**，启用 **WiseMindAI**。

## 连接 WiseMindAI

1. 打开 WiseMindAI 桌面端。
2. 在 WiseMindAI 设置里开启本地 API 服务。
3. 在 Obsidian 里打开 **设置 -> WiseMindAI**。
4. 如果你没有改过 WiseMindAI 的本地 API 地址，保留默认地址即可：

   ```text
   http://127.0.0.1:38221
   ```

5. 点击 **测试连接**。连接成功后，Obsidian 状态栏会显示 WiseMindAI 已连接。

## 打开插件面板

你可以通过下面几种方式打开：

- 点击 Obsidian 左侧边栏的 WiseMindAI 图标。
- 在命令面板里运行 **WiseMindAI: 打开面板**。
- 点击 Obsidian 底部状态栏里的 WiseMindAI 状态。

插件面板包含首页、总结、卡片、对话、同步、搜索、设置和教程页面。

## 主要功能

### 总结笔记

打开一篇 Markdown 笔记后，进入 WiseMindAI 面板的 **总结** 页面。你可以总结当前笔记、选中文本或手动选择的多篇笔记。生成后可以复制结果、插入当前笔记、保存为新的 Obsidian 笔记、保存到 WiseMindAI 笔记、继续追问，或基于总结生成知识卡片。

也可以在命令面板里直接运行：

- **WiseMindAI: 总结当前笔记**
- **WiseMindAI: 总结选中文本**

### 生成知识卡片

进入 **卡片** 页面，可以从笔记或选中文本生成结构化知识卡片。你可以设置卡片数量、难度、卡片类型、卡片集和文件夹。生成后可以保存到 WiseMindAI 卡片，也可以插入当前笔记。

也可以在命令面板里直接运行：

- **WiseMindAI: 从当前笔记生成知识卡片**
- **WiseMindAI: 从选中文本生成知识卡片**

### 与笔记对话

进入 **对话** 页面，可以围绕当前笔记或选中的内容继续提问。聊天框里输入 `@` 可以引用 Obsidian 仓库里的笔记。

### 改写选中文本

在编辑器里选中文字后，可以通过命令面板或右键菜单使用 WiseMindAI 进行改写、扩写、缩短、润色或提取标签。

### 发送笔记到 WiseMindAI

在 Obsidian 文件列表里右键 Markdown 文件或文件夹，可以发送到：

- WiseMindAI 笔记
- WiseMindAI 文档
- WiseMindAI 知识库

在编辑器里选中文本后，也可以通过右键菜单把选中文本发送到 WiseMindAI 笔记。

### 双向同步

进入 **同步** 页面，可以在两个方向之间同步 Markdown 内容：

- Obsidian -> WiseMindAI
- WiseMindAI -> Obsidian

你可以选择文件夹、选择目标位置、设置重复内容处理方式、保存同步方案，并查看同步记录。

### 搜索

进入 **搜索** 页面，可以同时搜索 Obsidian 笔记和 WiseMindAI 本地内容。

## 设置

可以从 **设置 -> WiseMindAI** 打开插件设置，也可以在插件面板里进入 **设置** 页面。常用设置包括：

- 语言：跟随 Obsidian、简体中文或英文。
- API 服务地址。
- 对话中输入 `@` 时的候选笔记数量。
- 默认知识卡片数量。
- 同步时遇到重复内容的处理方式：更新、跳过或创建副本。
- 导出和导入插件数据备份。

## 常见问题

- 如果提示 **无法连接 WiseMindAI**，请先打开 WiseMindAI 桌面端，并确认本地 API 服务已开启。
- 如果仍然连接失败，请检查 Obsidian 里的 API 地址是否和 WiseMindAI 中的本地 API 地址一致。
- 如果某篇笔记没有出现在同步列表里，请确认它是 Markdown 文件，并且不在 `.obsidian` 或 `.trash` 目录中。
- 如果生成结果为空，请确认当前笔记或选中文本里有足够可读取的内容。

---

# Development

During development, run this command from the project root:

```bash
pnpm dev:obsidian
```

Then go back to Obsidian, refresh the plugin list, and restart the plugin.

# Release

Run this command from the project root:

```bash
pnpm release:obsidian
```

The release folder and zip file will be generated in:

```text
packages/wisemindai-obsidian/dist
```

Copy the files from the generated folder to `/Users/wangpingan/leo/ai/wisemindai-sync/`, then push them with git.

Create a new release at:

```text
https://github.com/Chris8891/wisemindai-obsidian/releases
```

Use the version number as the release name, for example `0.2.4`. The release version should match `packages/wisemindai-obsidian/manifest.json`.

Upload the generated zip file and all files from the generated release folder.
