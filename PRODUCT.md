# Product

<!-- impeccable:product-schema 1 -->

<!-- Written by impeccable init from the README, the original design specs and a design interview with the owner on 2026-10-04. Facts marked (inferred) were not confirmed directly; correct them if wrong. -->

## Platform

web

## Users

People who want to keep a private daily diary, mostly on their phone with the app installed as a PWA, and sometimes on a laptop. Indonesian speakers first, English second. They write once a day, usually at the end of the day (inferred), often when tired or emotional, and sometimes want to talk the day through with an AI companion ("teman curhat") before or instead of writing.

## Product Purpose

A simple, minimalist diary that lives on the user's device. One entry per day, a one-tap mood, inline `#tags`, autosave. An optional AI companion, using the user's own API key, can talk about the day, remember facts the user can see and edit, and help turn a chat into an entry. Stats and a yearly or monthly Wrapped show the user patterns in their own mood and writing.

Success: the user opens the app, writes, and closes it without friction, and comes back the next day.

## Positioning

Local-first and private by construction: no account, no server needed, works offline, and optional sync is end-to-end encrypted. The AI companion is opt-in, bring-your-own-key, transparent about what it sends and what it remembers. Free and open source (AGPL-3.0-only).

## Operating Context

- Installed PWA on a phone, used one-handed, often at night in dark mode (inferred).
- Desktop browser for longer writing sessions.
- Indonesian and English UI; Indonesian is the default.
- Offline is normal, not an error state.

## Capabilities and Constraints

- Screens: Today (editor + mood), Archive (month calendar, search, tag filter), Chat, Memory, Stats (heatmap, streaks, mood distribution, tags), Wrapped (slides + shareable summary image), Settings (language, theme, AI provider, privacy switches, export/import, account and sync).
- Entries are Markdown, edited in TipTap. Export/import is a ZIP of Markdown files.
- Mood is an ordinal 1 to 5 scale, shown as emoji. Mood colour is the data colour in the heatmap, calendar, distribution and the share image; heatmap intensity shows how much was written.
- The Wrapped share image is drawn on a canvas from the CSS custom properties, and never contains diary text.
- No external network requests for assets: fonts and icons must be self-hosted so the app works offline and leaks nothing.
- No UI or animation libraries; plain CSS in `src/styles.css`. Motion must respect `prefers-reduced-motion`.
- Light and dark theme, following the system by default, overridable in Settings.

## Brand Commitments

- Name: Diary. The AI companion's name and style are chosen by the user.
- Calm, minimal, warm. The interface should step back so the writing comes first.
- Copy is plain and direct, never cheerful-corporate. Short sentences.

## Evidence on Hand

- No logo beyond the PWA icons in `public/`.
- No testimonials, user counts or press. Do not invent any.

## Product Principles

1. Writing first. Every screen should make it easier to start writing today's entry, not harder.
2. Private by default. Nothing leaves the device unless the user turned it on, and the UI says what is sent.
3. Quiet daily, expressive yearly. Daily screens stay calm; Wrapped is the one place for celebration.
4. Mood is data. Colour carries meaning (mood), so decoration does not compete with it.
5. The companion is a guest. AI features are optional, clearly marked, and never block the diary.

## Accessibility & Inclusion

- WCAG 2.2 AA contrast in both themes (inferred target).
- Mood colours must stay distinguishable for common colour-vision deficiencies, and mood is never conveyed by colour alone (emoji and labels carry it too).
- Crisis card with helplines (Healing119.id in Indonesia, findahelpline.com elsewhere) must stay prominent and readable.
- Full keyboard use, visible focus, `prefers-reduced-motion` respected.
