import { Extension } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'

export interface TagSuggestOptions {
  getSuggestions: (prefix: string) => string[]
  onTrigger: () => void
  label: (tag: string) => string
}

export interface TagTrigger {
  from: number
  to: number
  prefix: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tagSuggest: {
      /** Replace the `#prefix` before the cursor with `#tag ` (no second space if one follows), as its own undo step. */
      acceptTagSuggestion: (tag: string) => ReturnType
      /** Recompute the chips, e.g. after new suggestions arrived. */
      refreshTagSuggestions: () => ReturnType
    }
  }
}

const TAG_CHAR = /[\p{L}\p{N}_-]/u
// Same tag start rule as src/domain/tags.ts: '#' not preceded by a letter, digit, '_', '/', '&' or '#'.
const TRIGGER = /(?<![\p{L}\p{N}_/&#])#([\p{L}\p{N}_-]*)$/u
const LEAF = '￼'

interface PluginState {
  /** `from` of a trigger the user dismissed with Escape. */
  dismissedFrom: number | null
  /**
   * An IME composition started. Chips next to the composed text would disturb the input method, so they move to
   * an overlay. Only counts while `view.composing` is also true, so a missed compositionend cannot leave it stuck.
   */
  composing: boolean
  focused: boolean
}
type Meta = Partial<Pick<PluginState, 'composing' | 'focused'>> & { dismissedFrom?: number; refresh?: true }

const key = new PluginKey<PluginState>('tagSuggest')

/** The `#prefix` right before an empty cursor, or null when the cursor is not at a tag start. */
export function findTagTrigger(state: EditorState): TagTrigger | null {
  const { selection } = state
  if (!selection.empty) return null
  const $pos = selection.$from
  if (!$pos.parent.inlineContent || $pos.parent.type.spec.code) return null
  if ($pos.marks().some((m) => m.type.spec.code)) return null
  const after = $pos.parent.textBetween($pos.parentOffset, $pos.parent.content.size, undefined, LEAF)
  if (after && TAG_CHAR.test(after[0])) return null
  const before = $pos.parent.textBetween(0, $pos.parentOffset, undefined, LEAF)
  const m = TRIGGER.exec(before)
  if (!m) return null
  const from = $pos.pos - m[0].length
  let inCode = false
  state.doc.nodesBetween(from, $pos.pos, (node) => {
    if (node.marks.some((mark) => mark.type.spec.code)) inCode = true
  })
  if (inCode) return null
  return { from, to: $pos.pos, prefix: m[1].toLowerCase() }
}

function isComposing(state: EditorState, view: EditorView): boolean {
  return !!key.getState(state)?.composing && view.composing
}

/** The trigger and its suggestions when chips are visible (inline or, while composing, in the overlay), else null. */
function visibleChips(state: EditorState, getSuggestions: TagSuggestOptions['getSuggestions']) {
  const ps = key.getState(state)
  if (!ps || !ps.focused) return null
  const trigger = findTagTrigger(state)
  if (!trigger || ps.dismissedFrom === trigger.from) return null
  const tags = getSuggestions(trigger.prefix)
  return tags.length ? { trigger, tags } : null
}

/** Dispatch a meta-only transaction; returns false so other handlers still run. */
function setMeta(view: EditorView, meta: Meta): false {
  view.dispatch(view.state.tr.setMeta(key, meta))
  return false
}

/**
 * Ghost tag chips next to the cursor while typing `#`. The chips are a widget decoration,
 * so they are never part of the document, the markdown or the word count.
 */
export const TagSuggest = Extension.create<TagSuggestOptions>({
  name: 'tagSuggest',
  // Before the list keymaps, so Tab accepts a chip; inactive shortcuts return false and fall through.
  priority: 1000,

  addOptions() {
    return { getSuggestions: () => [], onTrigger: () => {}, label: (tag) => tag }
  },

  addCommands() {
    return {
      acceptTagSuggestion:
        (tag) =>
        ({ state, tr, dispatch }) => {
          const trigger = findTagTrigger(state)
          if (!trigger) return false
          if (dispatch) {
            const $to = state.doc.resolve(trigger.to)
            const next = $to.parent.textBetween($to.parentOffset, Math.min($to.parentOffset + 1, $to.parent.content.size), undefined, LEAF)
            const spaceFollows = /\s/u.test(next)
            // Its own undo step: undo brings back the typed `#prefix`, not the text before it.
            closeHistory(tr)
            tr.insertText(spaceFollows ? `#${tag}` : `#${tag} `, trigger.from, trigger.to)
            // Step over the existing space, as if it had been inserted.
            if (spaceFollows) tr.setSelection(TextSelection.create(tr.doc, trigger.from + tag.length + 2))
          }
          return true
        },
      refreshTagSuggestions:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(key, { refresh: true } satisfies Meta)
          return true
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      // Keys belong to the input method while it composes.
      Tab: ({ editor }) => {
        const shown = !isComposing(editor.state, editor.view) && visibleChips(editor.state, this.options.getSuggestions)
        return shown ? editor.commands.acceptTagSuggestion(shown.tags[0]) : false
      },
      Escape: ({ editor }) => {
        const shown = !isComposing(editor.state, editor.view) && visibleChips(editor.state, this.options.getSuggestions)
        if (!shown) return false
        setMeta(editor.view, { dismissedFrom: shown.trigger.from })
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    const { options, editor } = this

    const labelsOf = (tags: string[]) => tags.map((tag) => options.label(`#${tag}`))

    const render = (tags: string[], labels: string[]) => {
      const wrap = document.createElement('span')
      wrap.className = 'tag-suggest'
      wrap.contentEditable = 'false'
      tags.forEach((tag, i) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'tag-chip'
        button.setAttribute('aria-label', labels[i])
        button.textContent = `+${tag}`
        // Keep focus and the cursor in the editor.
        button.addEventListener('mousedown', (e) => e.preventDefault())
        button.addEventListener('click', () => {
          const view = editor.view
          if (!view.composing) return void editor.commands.acceptTagSuggestion(tag)
          // Overlay chip: end the composition first (browsers commit it on blur), so the input method does not
          // write its text over the accepted tag. Accept after ProseMirror has read the committed text; the
          // command recomputes the trigger from that state.
          view.dom.blur()
          view.focus()
          setTimeout(() => {
            if (!view.isDestroyed) editor.commands.acceptTagSuggestion(tag)
          })
        })
        wrap.append(button)
      })
      return wrap
    }

    return [
      new Plugin<PluginState>({
        key,
        state: {
          init: () => ({ dismissedFrom: null, composing: false, focused: false }),
          apply(tr, value, _old, next) {
            const meta = tr.getMeta(key) as Meta | undefined
            const composing = meta?.composing ?? value.composing
            const focused = meta?.focused ?? value.focused
            const dismissedFrom =
              meta?.dismissedFrom !== undefined
                ? meta.dismissedFrom
                : value.dismissedFrom === null || !findTagTrigger(next)
                  ? null
                  : tr.mapping.map(value.dismissedFrom)
            return { dismissedFrom, composing, focused }
          },
        },
        props: {
          decorations(state) {
            if (isComposing(state, editor.view)) return null
            const s = visibleChips(state, options.getSuggestions)
            if (!s) return null
            const labels = labelsOf(s.tags)
            return DecorationSet.create(state.doc, [
              Decoration.widget(s.trigger.to, () => render(s.tags, labels), {
                side: 1,
                // Labels in the key, so a language switch rebuilds the chips.
                key: `tag-suggest:${s.tags.join(',')}:${labels.join('|')}`,
                ignoreSelection: true,
                stopEvent: () => true,
              }),
            ])
          },
          handleDOMEvents: {
            focus: (view) => setMeta(view, { focused: true }),
            blur: (view) => setMeta(view, { focused: false, composing: false }),
            compositionstart: (view) => {
              // After ProseMirror's own handler, so `view.composing` is already true when the chips move.
              queueMicrotask(() => {
                if (!view.isDestroyed) setMeta(view, { composing: true })
              })
              return false
            },
            compositionend: (view) => {
              // After ProseMirror has read the composed text; skip if a new composition already started.
              setTimeout(() => {
                if (!view.isDestroyed && !view.composing) setMeta(view, { composing: false })
              })
              return false
            },
          },
        },
        view: () => {
          /**
           * While an IME composes, the chips live outside the contenteditable, in the editor's parent (which the
           * app gives `position: relative`), so the input method never sees them. Android keyboards compose every
           * word, so hiding the chips instead would mean they never show there.
           */
          let overlay: HTMLElement | null = null
          let overlayKey = ''
          const removeOverlay = () => {
            overlay?.remove()
            overlay = null
          }
          const syncOverlay = (view: EditorView) => {
            const parent = view.dom.parentElement
            const s = parent && isComposing(view.state, view) ? visibleChips(view.state, options.getSuggestions) : null
            if (!parent || !s) return removeOverlay()
            const labels = labelsOf(s.tags)
            const nextKey = `${s.tags.join(',')}:${labels.join('|')}`
            if (!overlay || overlayKey !== nextKey || overlay.parentElement !== parent) {
              removeOverlay()
              overlay = render(s.tags, labels)
              overlay.classList.add('tag-suggest--overlay')
              overlayKey = nextKey
              parent.append(overlay)
            }
            // Just below the cursor line, so the chips never cover the text being composed.
            const at = view.coordsAtPos(s.trigger.to)
            const box = parent.getBoundingClientRect()
            overlay.style.left = `${at.left - box.left + parent.scrollLeft}px`
            overlay.style.top = `${at.bottom - box.top + parent.scrollTop}px`
          }
          return {
            update(view, prev) {
              syncOverlay(view)
              const now = findTagTrigger(view.state)
              if (!now) return
              const before = findTagTrigger(prev)
              if (!before || before.from !== now.from) options.onTrigger()
            },
            destroy: removeOverlay,
          }
        },
      }),
    ]
  },
})
