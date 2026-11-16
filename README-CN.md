<p align="right">
  <a href="./README.md"><img src="https://img.shields.io/badge/README-English-0969da" alt="Open the English README"></a>
</p>

# WiseMindAI Obsidian 插件

直接使用 Obsidian 仓库里已有的笔记完成 AI 处理，不再反复把内容复制到其他应用，再把结果复制回来。

WiseMindAI Obsidian 插件可以把你的仓库和 WiseMindAI 桌面端连接起来。你可以在同一个侧边栏里总结笔记、围绕内容对话、生成知识卡片、优化选中文字、实时转录、跨应用搜索，并把 Obsidian 笔记单向同步到 WiseMindAI「我的资料」。

[下载 WiseMindAI](https://wisemindai.app) · [安装 Obsidian 插件](https://community.obsidian.md/plugins/wisemindai) · [查看完整指南](https://www.wisemindai.app/guide/obsidian-plugin)

> **必须配合 WiseMindAI 桌面端使用。** 请先前往 [wisemindai.app](https://wisemindai.app) 下载客户端，保持客户端运行，并在 WiseMindAI 设置中开启**本地 API 服务**。完成本地连接后，才能使用插件的全部功能。

## 产品介绍

WiseMindAI for Obsidian 是连接 Obsidian 与 WiseMindAI AI 知识工作台的本地桥梁。它让笔记成为总结、提问、复习、写作和资料整理的直接上下文，同时保留 Obsidian 原有的 Markdown 工作方式。

插件通过本机连接与 WiseMindAI 桌面端通信。你可以决定使用本地模型还是在线模型，也可以决定生成结果是否写回笔记。

## 核心功能

### 在 Obsidian 中直接总结笔记

可以总结当前笔记、选中的文字或多篇笔记。生成后可以复制结果、插入光标位置、另存为新的 Obsidian 笔记、保存到 WiseMindAI 笔记、继续追问，或根据总结生成知识卡片。

### 围绕笔记内容对话

可以针对当前笔记或选中内容提问。在对话中输入 `@`，还能引用仓库里的其他笔记，方便比较不同资料、查找联系，不必每次重新整理上下文。

### 把笔记变成可编辑的知识卡片

可以从笔记或选中内容生成问答卡、概念卡或混合类型卡片。你可以设置数量、难度、保存的卡片集和文件夹，并在保存到 WiseMindAI 或插入当前笔记前检查和编辑结果。

### 直接优化选中的文字

选中一段文字后，可以通过命令面板或编辑器菜单进行改写、扩写、缩短、润色或生成标签。是否把生成内容插入笔记，始终由你决定。

### 实时录音与转录

可以从 WiseMindAI 侧边栏开始会议、课堂、访谈或灵感记录。录音期间能够查看实时文字、暂停和继续，并把确认后的内容持续写入指定的 Obsidian 笔记。结束后还可以整理出摘要、重点和待办事项。使用前需要在 WiseMindAI 桌面端配置可用的实时转录平台。

### 发送文件与单向同步

右键点击 Markdown 文件、选中的文字或文件夹，可以发送到 WiseMindAI 笔记、文档或专题。同步页面支持把 Obsidian 仓库增量同步到 WiseMindAI（当前版本默认单向：Obsidian → WiseMindAI）。遇到已有内容时，可以选择更新、跳过或创建副本；冲突时默认不覆盖 Obsidian 原文。

### 同时搜索两边的内容

可以在同一个面板中搜索 Obsidian 笔记和 WiseMindAI 本地内容，并打开需要的原始资料。

## 适用场景

- **会议、课堂和访谈：** 把实时转录写入指定笔记，记录重点，结束后整理成摘要和待办清单。
- **学习与复习：** 总结课程、书籍和长笔记，继续追问，再把重要内容转成可编辑的知识卡片。
- **研究与资料整合：** 一次处理多篇笔记，通过 `@` 引用补充上下文，并把选中的资料发送到 WiseMindAI 专题。
- **写作与编辑：** 不离开当前文档就能优化段落、生成标签或插入摘要。
- **知识迁移：** 把 Obsidian Markdown 单向增量同步到 WiseMindAI，保留原有结构，并用同步方案减少重复工作。

## 安装与连接

### 1. 安装 Obsidian 插件

1. 在 Obsidian 桌面端打开**设置 -> 第三方插件**。
2. 点击**浏览**，搜索 **WiseMindAI**。
3. 安装并启用插件。

插件只支持桌面端，因为它需要连接电脑上运行的 WiseMindAI 服务。

### 2. 下载 WiseMindAI 客户端

前往 [wisemindai.app](https://wisemindai.app) 下载并安装最新版 WiseMindAI 桌面客户端，然后启动应用。

### 3. 开启本地 API 服务

1. 打开 WiseMindAI 设置。
2. 找到**本地 API 服务**并开启。
3. 使用 Obsidian 插件期间，保持 WiseMindAI 客户端运行。

默认本地 API 地址是：

```text
http://127.0.0.1:38221
```

### 4. 测试连接

1. 在 Obsidian 中打开**设置 -> WiseMindAI**。
2. 如果没有修改过 WiseMindAI 的端口，保留默认地址即可。
3. 点击**测试连接**。

连接成功后，可以通过左侧栏图标、底部状态栏，或命令面板中的 **WiseMindAI: 打开面板**进入插件。

## 手动安装

如果无法通过第三方插件目录安装：

1. 从[最新版本](https://github.com/Chris8891/wisemindai-obsidian/releases/latest)中下载 `main.js`、`styles.css` 和 `manifest.json`。
2. 在 Obsidian 仓库内创建 `.obsidian/plugins/wisemindai/` 文件夹。
3. 把三个文件复制到该文件夹。
4. 重启 Obsidian，然后在**第三方插件**中启用 **WiseMindAI**。

## 数据与隐私

- Obsidian 插件通过电脑上的本地连接与 WiseMindAI 桌面端通信。
- 插件不会自行把整个 Obsidian 仓库上传到第三方服务器。
- AI 处理会使用你在 WiseMindAI 中配置的模型。根据你的选择，模型可能在本地运行，也可能使用在线服务。
- 总结、对话和知识卡片不会自动改写原笔记。只有当你明确执行插入、新建、发送、同步或实时写入操作时，内容才会写入。

## 常见问题

- **无法连接 WiseMindAI：** 确认桌面客户端已经启动并更新到最新版本，同时已经开启本地 API 服务。
- **测试连接仍然失败：** 检查两个应用中的 API 地址和端口是否一致。
- **无法使用实时转录：** 更新 WiseMindAI，并在模型设置中配置可用的实时转录平台。
- **同步列表中缺少笔记：** 确认它是 Markdown 文件，并且不在 `.obsidian`、`.trash` 或其他被忽略的文件夹内。
- **生成结果为空：** 确认笔记或选中内容有足够的可读文字，并检查配置的模型是否可用。

## 版本与许可

Obsidian 插件免费、只支持桌面端，并采用 [MIT 许可证](./LICENSE)。WiseMindAI 桌面端提供免费版和可选的 Pro 功能。

## 开发

在项目根目录运行：

```bash
pnpm dev:obsidian
```

构建发布包：

```bash
pnpm release:obsidian
```
