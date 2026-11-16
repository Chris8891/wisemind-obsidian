<p align="right">
  <a href="./README-CN.md"><img src="https://img.shields.io/badge/README-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-0969da" alt="Open the Chinese README"></a>
</p>

# WiseMindAI for Obsidian

Use AI with the notes already in your Obsidian vault, without repeatedly copying content into another app and bringing the results back.

[Download WiseMindAI](https://wisemindai.app) · [Install the Obsidian plugin](https://community.obsidian.md/plugins/wisemindai) · [Read the full guide](https://www.wisemindai.app/en/guide/obsidian-plugin)

> **The WiseMindAI desktop app is required.** Download it from [wisemindai.app](https://wisemindai.app), keep it running, and enable the **Local API service** in WiseMindAI settings. The plugin needs this local connection to provide its complete feature set.

## About WiseMindAI for Obsidian

WiseMindAI for Obsidian connects your vault to the WiseMindAI desktop app. From one sidebar, you can summarize notes, chat with your content, create knowledge cards, improve selected text, transcribe conversations, search across both apps, and sync Obsidian Markdown one-way into WiseMindAI.

It acts as a local bridge between Obsidian and the WiseMindAI knowledge workspace. Your notes become direct context for AI-assisted study, research, writing, and organization while staying in your existing Markdown workflow.

## Core Features

### Summarize notes without leaving Obsidian

Summarize the current note, selected text, or several notes together. You can copy the result, insert it at the cursor, save it as a new Obsidian note, send it to WiseMindAI Notes, continue the conversation, or turn it into knowledge cards.

### Chat with your vault as context

Ask questions about the note you are reading or the text you selected. Type `@` in chat to include other notes from your vault, so you can compare ideas and explore connections without rebuilding the context by hand.

### Turn notes into editable knowledge cards

Create Q&A cards, concept cards, or a mix of both from a note or selected passage. Choose the number of cards, difficulty, destination deck, and folder, then review the cards before saving them to WiseMindAI or inserting them into your note.

### Rewrite selected text in place

Select a passage and use the command palette or editor menu to rewrite, expand, shorten, polish, or generate tags. You remain in control of whether generated content is inserted.

### Record and transcribe in real time

Start live transcription from the WiseMindAI sidebar for a meeting, class, interview, or idea. Follow the transcript as it appears, pause and resume recording, write confirmed text to a chosen Obsidian note, and organize the result into a summary, key points, and action items. A supported transcription provider must be configured in the WiseMindAI desktop app.

### Send and sync Markdown one way

Right-click a Markdown file, selected text, or a folder to send it to WiseMindAI Notes, Documents, or a topic. The Sync page incrementally syncs your Obsidian vault into WiseMindAI (v2 defaults to Obsidian → WiseMindAI only). When content already exists, choose whether to update it, skip it, or create a copy. Conflicts never overwrite the Obsidian original by default.

### Search both knowledge spaces

Search Obsidian notes and local WiseMindAI content from the same panel, then open the source you need.

## Common Workflows

- **Meetings, classes, and interviews:** transcribe audio into a selected note, mark important information, and turn the finished record into a useful summary and action list.
- **Study and review:** summarize lectures, books, or course notes, ask follow-up questions, and convert the important ideas into editable cards for later review.
- **Research and knowledge synthesis:** combine several notes in one summary or conversation, use `@` references to add context, and send selected material to a WiseMindAI topic.
- **Writing and editing:** improve a selected paragraph, generate tags, or insert a summary without switching away from your document.
- **Knowledge migration:** move Markdown between Obsidian and WiseMindAI, preserve its organization, and reuse saved sync plans for recurring work.

## Install and Connect

### 1. Install the Obsidian plugin

1. In Obsidian desktop, open **Settings -> Community plugins**.
2. Select **Browse** and search for **WiseMindAI**.
3. Install and enable the plugin.

The plugin is desktop-only because it connects to a service running on your computer.

### 2. Download WiseMindAI

Download and install the latest WiseMindAI desktop client from [wisemindai.app](https://wisemindai.app), then open it.

### 3. Enable the Local API service

1. Open WiseMindAI settings.
2. Find **Local API service** and enable it.
3. Keep WiseMindAI running while using the Obsidian plugin.

The default local API address is:

```text
http://127.0.0.1:38221
```

### 4. Test the connection

1. In Obsidian, open **Settings -> WiseMindAI**.
2. Keep the default API address unless you changed the port in WiseMindAI.
3. Select **Test connection**.

Once connected, open the WiseMindAI panel from the left ribbon, the status bar, or **WiseMindAI: Open panel** in the command palette.

## Manual Installation

If you cannot use the Community Plugins directory:

1. Download `main.js`, `styles.css`, and `manifest.json` from the [latest release](https://github.com/Chris8891/wisemindai-obsidian/releases/latest).
2. Create `.obsidian/plugins/wisemindai/` inside your vault.
3. Copy the three files into that folder.
4. Restart Obsidian, then enable **WiseMindAI** under **Community plugins**.

## Data and Privacy

- The Obsidian plugin communicates with the WiseMindAI desktop app through a local connection on your computer.
- The plugin does not independently upload your vault to a third-party server.
- AI processing follows the model you configure in WiseMindAI. Depending on your choice, that model may run locally or use an online provider.
- Summaries, conversations, and cards do not rewrite your original notes automatically. Content is written only when you choose an insert, create, send, sync, or live-transcription action.

## Troubleshooting

- **Cannot connect to WiseMindAI:** confirm that the desktop app is open, up to date, and its Local API service is enabled.
- **Connection test still fails:** make sure the API address and port match in both apps.
- **Live transcription is unavailable:** update WiseMindAI and configure a supported transcription provider in its model settings.
- **A note is missing from sync:** confirm it is a Markdown file and is not inside `.obsidian`, `.trash`, or another ignored folder.
- **Generated content is empty:** make sure the selected note or passage contains enough readable text and that the configured model is available.

## Availability

The Obsidian plugin is free, desktop-only, and released under the [MIT License](./LICENSE). The WiseMindAI desktop app has a free plan with optional Pro features.

## Development

From the project root, run:

```bash
pnpm dev:obsidian
```

To build a release package, run:

```bash
pnpm release:obsidian
```
