import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ChevronLeft } from '../../app/icons'

/** `**bold**` inside one line of the guide. */
function inline(line: string) {
  return line.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part))
}

/**
 * The guide the first entry opens with, kept reachable after that entry is deleted. Its text is the app's own
 * Markdown (headings and lists only), drawn here without the editor.
 */
export function GuidePage() {
  const { t } = useTranslation()
  const blocks = t('guide.body').split(/\n\n/)
  return (
    <article className="guide">
      <header className="back-header">
        <Link className="icon-btn" to="/settings" aria-label={t('common.back')}>
          <ChevronLeft />
        </Link>
        <h1>{t('guide.title')}</h1>
      </header>
      {blocks.map((block, i) =>
        block.startsWith('## ') ? (
          <h2 key={i}>{block.slice(3)}</h2>
        ) : (
          <ul key={i}>
            {block.split('\n').map((line, j) => (
              <li key={j}>{inline(line.replace(/^- /, ''))}</li>
            ))}
          </ul>
        ),
      )}
    </article>
  )
}
