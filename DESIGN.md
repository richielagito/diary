---
name: Diary
description: A private daily diary in ink on warm paper, where mood is the only colour.
colors:
  paper: "#fbfaf7"
  surface: "#ffffff"
  sunken: "#f3f1ec"
  ink: "#22201c"
  muted-ink: "#6b665d"
  hairline: "#e5e1d8"
  hairline-strong: "#cdc7bb"
  danger: "#b42318"
  mood-1: "#2d54a0"
  mood-2: "#4db2db"
  mood-3: "#7c7368"
  mood-4: "#d6ab32"
  mood-5: "#db551d"
  mood-none: "#8f887b"
  paper-dark: "#191714"
  surface-dark: "#211f1b"
  sunken-dark: "#141210"
  ink-dark: "#ece8e1"
  muted-ink-dark: "#a39d92"
  hairline-dark: "#33302b"
  hairline-strong-dark: "#4a463f"
  danger-dark: "#f2786c"
  mood-1-dark: "#84aaf5"
  mood-2-dark: "#0082b6"
  mood-3-dark: "#726555"
  mood-4-dark: "#a58b00"
  mood-5-dark: "#ff9657"
  mood-none-dark: "#78726a"
typography:
  display:
    fontFamily: "Literata, Georgia, 'Times New Roman', serif"
    fontSize: "clamp(2rem, 1.4rem + 3vw, 3rem)"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Literata, Georgia, 'Times New Roman', serif"
    fontSize: "1.75rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  writing:
    fontFamily: "Literata, Georgia, 'Times New Roman', serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.75
  page-title:
    fontFamily: "Literata, Georgia, 'Times New Roman', serif"
    fontSize: "clamp(1.6rem, 1.2rem + 1.6vw, 2.1rem)"
    fontWeight: 500
    lineHeight: 1.2
  figure:
    fontFamily: "Literata, Georgia, 'Times New Roman', serif"
    fontSize: "1.5rem"
    fontWeight: 500
    lineHeight: 1
  lead:
    fontFamily: "Literata, Georgia, 'Times New Roman', serif"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.4
  glyph:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "1.375rem"
    lineHeight: 1
  title:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  control:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.3
  small:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.55
  micro:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
  mono:
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: "0.875em"
rounded:
  mark-xs: "2px"
  mark: "3px"
  xs: "4px"
  sm: "6px"
  segment: "7px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  bubble: "18px"
  pill: "999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  base: "1rem"
  lg: "1.25rem"
  xl: "1.75rem"
  2xl: "2rem"
  shell-max: "44rem"
components:
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.95rem"
    height: "2.75rem"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.95rem"
    height: "2.75rem"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.muted-ink}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.5rem"
  button-quiet-hover:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink}"
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
    rounded: "{rounded.md}"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.muted-ink}"
    rounded: "{rounded.pill}"
    size: "2.75rem"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.75rem"
    height: "2.75rem"
  nav-link:
    textColor: "{colors.muted-ink}"
    typography: "{typography.control}"
    padding: "0.75rem 0 0.7rem"
  nav-link-active:
    textColor: "{colors.ink}"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0.2rem 0.65rem"
  mood-button:
    backgroundColor: "transparent"
    rounded: "{rounded.pill}"
    size: "2.75rem"
  chat-bubble-user:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.bubble}"
    padding: "0.625rem 0.95rem"
  chat-bubble-assistant:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.bubble}"
    padding: "0.625rem 0.95rem"
  banner:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0.875rem 1rem"
---

<!-- Provenance: recorded after the build, from the ui-redesign branch (src/styles.css, src/app/icons.tsx, public/fonts, src/features/**). Code-led: the owner's pinned "evolve, not redesign" brief replaced the concept roll, so this system has no seed key. Where the direction contract and the build differ, the build is recorded. -->

# Design System: Diary

## Overview

**Creative North Star: "Ink on Warm Paper"**

Diary is a notebook that steps back so the writing leads. The interface is monochrome: warm off-white paper, near-black ink, hairline rules, and a serif writing face for anything the user wrote or reads as a page. There are no brand accents. The accent colour is the text colour, so a primary button is simply a filled block of ink.

Colour is reserved for one thing: mood. Mood is an ordinal 1 to 5 scale, drawn as a cool-to-warm diverging palette through a neutral middle, and it appears only where mood is the data (picker, calendar dots, heatmap, distribution bars, the Wrapped wash and share image). Daily screens stay quiet and dense in the way a page is dense: one centred column, generous line height, rules instead of cards. Wrapped is the single expressive surface, where the period's moods wash the page and serif titles get large.

The system deliberately refuses the category default of an indigo-accented card dashboard: no tinted brand colour, no grid of shadowed stat cards, no UI or animation libraries. Everything is plain CSS on custom properties in `src/styles.css`, with light and dark themes that follow the system unless overridden.

**Key Characteristics:**
- Monochrome UI: ink on warm paper, accent equals text colour.
- Mood is the only expressive colour; danger is the only functional one.
- Literata for writing surfaces and page titles; system sans for interface.
- Hairline borders and tonal sunken fills instead of shadows.
- One centred 44rem column with a sticky top text nav on wider screens and a fixed bottom text nav on phones.
- Wrapped is the one loud surface; everything else is calm.

## Colors

A warm neutral ink-and-paper scale, plus a five-step mood palette that is the only colour with meaning.

### Primary
- **Warm Ink** (`ink`; dark theme `ink-dark`): body text, headings, primary button fill, active nav underline, focus outline, the user's chat bubble, checkbox and radio accent (`accent-color`). The UI has no separate accent.

### Neutral
- **Warm Paper** (`paper`; dark `paper-dark`): page background, sticky nav and composer background, text on ink fills.
- **Surface White** (`surface`; dark `surface-dark`): buttons, inputs, dialogs, assistant chat bubbles, letter paper in Wrapped.
- **Sunken Linen** (`sunken`; dark `sunken-dark`): hover fill for quiet buttons, rows and calendar days; banners; code blocks; the stats segmented control track.
- **Faded Ink** (`muted-ink`; dark `muted-ink-dark`): secondary text, placeholders, legends, inactive nav links, h3.
- **Hairline** (`hairline`; dark `hairline-dark`): dividers, list rules, dialog and card edges, heatmap empty cells.
- **Strong Hairline** (`hairline-strong`; dark `hairline-strong-dark`): control borders, link underlines at rest, blockquote rule.

### Functional
- **Alarm Red** (`danger`; dark `danger-dark`): errors, destructive buttons, the crisis card and the unread nav dot. It never decorates.

### Mood scale
Cool (heavy) to warm (bright) through a neutral middle; each theme has its own set, chosen for separation under common colour-vision deficiencies rather than by lightness alone.
- **Mood 1, Deep Night Blue** (`mood-1`): the heaviest days.
- **Mood 2, Rain Blue** (`mood-2`).
- **Mood 3, Stone** (`mood-3`): the neutral middle; also the Wrapped fallback wash.
- **Mood 4, Ochre** (`mood-4`).
- **Mood 5, Ember** (`mood-5`): the brightest days.
- **No Mood, Ash Ring** (`mood-none`): a day that has an entry but no mood. Drawn only as a ring.

### Named Rules
**The Mood Is The Only Colour Rule.** Hue appears only where mood is the data. Every other element is drawn from ink, paper and their mixes; a new screen that needs "a bit of colour" uses ink weight or a sunken fill instead.

**The Ring, Not Fill Rule.** A day with an entry but no mood is a 1.5px inset ring in `mood-none`, never a filled swatch, so it cannot be read as mood 3.

**The Never Colour Alone Rule.** Mood is always also carried by its emoji, label or accessible name; colour reinforces, it does not inform alone.

## Typography

**Display Font:** Literata (self-hosted variable, optical size axis; fallback Georgia, Times New Roman, serif)
**Body Font:** system-ui sans stack
**Label/Mono Font:** ui-monospace stack, for code and the recovery key

**Character:** A bookish optical-size serif for the page the user writes and reads, against an invisible native sans for every control, so the interface reads as tooling around a page.

### Hierarchy
- **Display** (Literata 500, clamp(2rem, 1.4rem + 3vw, 3rem), 1.1, -0.025em): Wrapped slide titles only.
- **Headline** (Literata 500, 1.75rem, 1.2, -0.015em, balanced wrap): every page h1. The Today date heading scales fluidly (clamp(1.6rem, 1.2rem + 1.6vw, 2.1rem)); the month heading in Archive and Stats is 1.6rem.
- **Writing** (Literata 400, 1.125rem, 1.75): the editor, with serif h1 to h3 inside the entry at 600. Excerpts, stat figures, empty states, the Wrapped lead (1.25rem) and the Wrapped letter (1.0625rem) also use Literata.
- **Title** (sans 600, 1.0625rem, 1.3): section h2. h3 is sans 600 at 0.875rem in faded ink.
- **Body** (sans 400, 1rem, 1.55): interface prose.
- **Control** (sans, 0.9375rem, 1.3): buttons, inputs, nav links, banners.
- **Lead** (Literata 500, 1.25rem): the one figure or sentence that leads a section: stat values, "Paling sering", Wrapped leads, empty-state lines, entry h2.
- **Figure** (Literata 500, 1.5rem, line-height 1): day numbers in the Archive day list and entry h1.
- **Glyph** (1.375rem): the emoji on the mood picker.
- **Label** (sans, 0.8125rem): small print, legends, save status, chat history chips. Sentence case; no tracking.
- **Micro** (sans, 0.75rem): calendar and heatmap axis labels, message meta, the context-preview prompt. Never for sentences a person must read to act.

### Named Rules
**The Serif Means Page Rule.** Literata is for things the user writes or reads as a page (entry, titles, excerpts, letters, stat figures). Controls, labels and navigation stay in the system sans.

**The One Swap Point Rule.** The writing face is set only through `--font-text` and its `@font-face` files. Literata was chosen over Newsreader; swapping it touches nothing else.

## Layout

A single centred column (`.shell`, max 44rem) with 1.25rem side padding (1rem under 360px) and 5rem bottom padding. Above 640px a sticky top text nav spans the column edge to edge. At 640px and below it becomes a fixed bottom bar within thumb reach: the same text links on a top hairline, the active link marked by a 2px ink rule above it, at least 3.25rem tall plus the safe-area inset, tightening its type at 400px and 360px. It hides only while the on-screen keyboard is open (a focused text field and a visual viewport shrunk below 80% of its tallest), and the chat composer sits on top of it through `--nav-h`. Order: Hari ini, Arsip, Curhat, Statistik, Pengaturan. Spacing is rem-based and comes from a short ladder (0.25, 0.5, 0.75, 1, 1.25, 1.75, 2rem); section breaks use 1.5 to 2.25rem plus a hairline rule rather than boxes.

Groups of buttons are paragraphs that become wrapping flex rows with a 0.5rem gap. Settings fields are label-left, control-right rows that wrap on narrow screens, with controls capped at 20rem. The stats summary is a three-column ledger divided by hairlines that collapses to label/value rows at 520px. Calendars and the month heatmap are seven-column grids of square cells. Chat fills the screen down to the nav: an empty conversation centres its invitation, messages sit on the bottom edge, and the composer (an auto-growing field and a round icon send button) stays pinned on top of the nav. Everything around the conversation (save to diary, delete, earlier days, what the AI reads, memory) lives on a separate details page behind the icon beside the title. Wrapped is a full-viewport overlay with slides centred in a 30rem column.

## Elevation & Depth

Flat by default. Depth comes from tone (paper, white surface, sunken linen) and 1px hairlines. One shadow token exists, `--shadow-pop`, and it is used only for things that float above or sit on the page as objects: dialogs, the text-formatting bubble, the import dialog, and the Wrapped envelope and letter.

### Shadow Vocabulary
- **Pop** (`box-shadow: 0 6px 24px -8px rgb(34 32 28 / 0.18), 0 1px 3px rgb(34 32 28 / 0.08)`; dark `0 8px 28px -8px rgb(0 0 0 / 0.6), 0 1px 3px rgb(0 0 0 / 0.4)`): floating layers and paper objects only.

### Named Rules
**The Hairline Over Shadow Rule.** Lists, sections, stat rows, banners and cards separate with a 1px hairline or a sunken fill. A resting surface never gets a shadow.

## Shapes

Gently rounded, never pill-heavy. Heat cells and swatches are tiny marks at 2 to 3px; the selected segment of a segmented control is 7px inside its 10px track. Controls and code blocks use 8px; banners, fieldsets and calendar days 10px; dialogs, the composer field and the crisis card 12px. Circles and pills (999px) are reserved for icon buttons, the mood picker, tag and history chips, and dots. Chat bubbles are 18px with one 6px tail corner on the speaker's side. The Wrapped letter is nearly square (4px) and its envelope 6px, with a clipped triangular flap. Borders are 1px; the only 1.5px strokes are the today ring and the no-mood ring.

Icons are line icons on a 20px grid, one 1.75 stroke, round caps and joins, `currentColor`, inline SVG (`src/app/icons.tsx`), and always decorative beside a labelled control.

## Components

### Buttons
Quiet outline by default; one ink action per group.
- **Shape:** gently curved (8px), minimum 2.75rem (44px) tall.
- **Default:** surface fill, strong-hairline border, ink text; hover darkens the border to ink; press nudges down 1px.
- **Primary:** solid ink fill, paper text, weight 500; hover mixes ink 86% toward paper. The Wrapped entry link uses the same treatment and carries a two-tone swatch of the period's two leading moods.
- **Danger:** danger text with a 40% danger border.
- **Quiet:** no border or fill, faded ink; hover shows a sunken fill and ink text.
- **Icon:** 2.75rem circle, transparent, faded ink, sunken on hover.
- **Focus:** 2px ink outline at 2px offset everywhere.

### Chips
- **Style:** pill (999px), 1px hairline, small sans. Tag stats sit on surface; chat history chips are faded ink and darken on hover.
- **Ghost tag suggestions:** dashed `currentColor` pill at 55% opacity beside the cursor, full opacity on hover or focus. A decoration, never text.

### Cards / Containers
- **Corner Style:** 10px for banners, 12px for dialogs and the crisis card.
- **Background:** sunken for banners; surface for dialogs; danger mixed 6 to 7% into the surface for the crisis card and error banner.
- **Shadow Strategy:** none at rest; Pop only for floating layers (see Elevation).
- **Border:** 1px hairline.
- **Internal Padding:** 0.875rem 1rem (banner) to 1rem 1.25rem (crisis, import).

### Inputs / Fields
- **Style:** surface fill, 1px strong hairline, 8px radius, 2.75rem minimum height; selects draw their own two-triangle chevron in faded ink.
- **Focus:** border turns ink plus a 3px ink halo at 12%.
- **Disabled:** 55% opacity. Errors are announced as `role="alert"` text in danger.

### Navigation
- **Style:** sticky top bar on paper with a hairline bottom edge; plain text links in control size, faded ink; hover to ink; the active link is ink with a 2px ink underline sitting on the hairline. No icons, no pills.

### Mood Picker
Five emoji in 2.75rem circles. At rest they are greyscale at 78% opacity; hover restores colour; the selected mood gets a 20% mood fill and a 60% mood ring. Tapping the selected mood clears it.

### Mood Marks
Calendar dots (7px), heatmap cells (12px year, 8px compact, square month cells), legend swatches and distribution bars fill with the mood colour; heatmap opacity encodes how much was written, never below 50% so the mood hue stays readable. No-mood days are rings in `mood-none`.

### Wrapped
The one expressive surface. A full-screen overlay washed by two drifting radial gradients from the period's two most frequent non-neutral moods (`moodWash`; falls back to mood 3), thin progress segments in ink, Display serif titles, and slides that enter over 520ms (`cubic-bezier(0.16, 1, 0.3, 1)`, rise 16px, slight scale and blur). The AI letter sits in an envelope with a flap, then on a sheet of paper. Under `prefers-reduced-motion` the wash stops drifting, slides appear without animation, and transitions are cut everywhere.

## Do's and Don'ts

### Do:
- **Do** use ink (`--text`) as the only UI accent: primary fill, active underline, focus outline, checkbox accent.
- **Do** read every colour from the custom properties on `:root` so both themes and the Wrapped share image stay correct.
- **Do** draw a day with an entry but no mood as a 1.5px `--mood-none` ring.
- **Do** keep mood emoji as the mood glyphs; they are data, not icons.
- **Do** use Literata through `--font-text` for written and page content, and the system sans for controls.
- **Do** separate content with hairlines and sunken fills; reserve `--shadow-pop` for floating layers and paper objects.
- **Do** keep one primary (ink) button per group.
- **Do** self-host fonts and inline icons as 20px, 1.75-stroke SVG; the app makes no asset requests.
- **Do** gate every animation behind `prefers-reduced-motion`.

### Don't:
- **Don't** introduce a brand or accent hue; colour outside the mood scale is limited to `--danger` for errors, destructive actions and the crisis card.
- **Don't** use mood colours for decoration, status or emphasis outside mood marks.
- **Don't** fill a no-mood day.
- **Don't** add UI or animation libraries, icon fonts or remote fonts.
- **Don't** build dashboards of shadowed cards; summaries are hairline ledgers.
- **Don't** add icons to the nav; it is a sticky top text nav.
- **Don't** bring Wrapped's washes, large titles or motion into the daily screens.
