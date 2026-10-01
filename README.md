# Diary

A simple, minimalist diary that lives in your browser. Your writing stays on your device. An optional AI companion ("teman curhat") can talk with you about your day, using your own API key.

Diary is a local-first PWA: it works offline, can be installed on a phone, and needs no account.

> Aplikasi diary sederhana yang menyimpan semua tulisan di perangkatmu sendiri, dengan teman curhat AI opsional. Antarmuka tersedia dalam Bahasa Indonesia dan English.

## Features

**Diary**
- One entry per day, written in a rich-text editor and stored as Markdown.
- One-tap mood (1 to 5) and inline `#tags`.
- Autosave, with no save button.
- Archive with a monthly calendar, full-text search and tag filter.
- Export and import as a ZIP of Markdown files.
- Light and dark theme. Indonesian and English.

**AI companion (optional, bring your own key)**
- Chat with a companion whose name and style you choose.
- It can read your recent entries for context, if you allow it.
- It remembers facts about you. You can see, edit and delete every memory.
- Weekly and monthly summaries keep long-term context small.
- Turn a chat into a diary entry.
- Tag suggestions while you type `#`.
- A crisis card with helplines appears when a message suggests you may be in danger.

**Stats and Wrapped**
- Mood heatmap by month or year: colour shows mood, intensity shows how much you wrote.
- Writing streaks, mood distribution and trend, top tags, and tags that go with better moods.
- Wrapped: a yearly or monthly story in slides, with an optional short letter from your companion.
- A summary image you can save or share. It never contains diary text.

## Privacy

- Entries, moods, chats, memories and settings are stored in your browser (IndexedDB). There is no server.
- AI features are off until you add an API key. The key is stored in your browser and sent only to the provider you configured.
- When AI is on, the text needed for a feature is sent to that provider: your messages, and, if you allow it, recent diary entries, memories and summaries. Each of these has its own switch in Settings.
- The Wrapped letter is written from statistics, memories and summaries only, never from diary text.
- Because everything is local, clearing site data deletes your diary. Export a backup regularly.

## Supported AI providers

Anthropic, OpenAI, OpenRouter, Google Gemini, Ollama (local), and any OpenAI-compatible endpoint.

## Getting started

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Then open the address Vite prints (by default http://localhost:5173).

To use the AI companion, open **Pengaturan** (Settings), choose a provider, paste your API key, and press **Simpan**.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Run unit and component tests (Vitest) |
| `npm run typecheck` | Type-check only |
| `npm run e2e` | Run end-to-end tests (Playwright, builds first) |

Tests never call a real AI provider.

## Deploying

`npm run build` produces a static site in `dist/`. Host it on any static host that can serve `index.html` for unknown paths (single-page app fallback). Serve it over HTTPS so the service worker and installation work.

## Tech stack

React, TypeScript, Vite, Dexie (IndexedDB), TipTap, i18next, vite-plugin-pwa, Vitest and Playwright.

## Not a substitute for professional help

The AI companion is not a therapist and can be wrong. If you are in danger or thinking about hurting yourself, contact local emergency services or a crisis line. In Indonesia: Healing119.id (call 119 ext 8, or chat at https://www.healing119.id). Elsewhere: https://findahelpline.com.

## Roadmap

- An optional paid tier with hosted AI and end-to-end-encrypted sync between devices. The diary and bring-your-own-key AI stay free.

## License

[GNU Affero General Public License v3.0 only](LICENSE) (AGPL-3.0-only).
