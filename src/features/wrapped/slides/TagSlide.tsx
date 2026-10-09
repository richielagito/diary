import { useTranslation } from 'react-i18next'
import type { PeriodStats } from '../../../stats/computeStats'

/** One fact in display type, then a few quiet lines: a story about the tags, not the Stats section again. */
export function TagSlide({ stats }: { stats: PeriodStats }) {
  const { t, i18n } = useTranslation()
  const list = (tags: string[]) => new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(tags.map((tag) => `#${tag}`))
  const [first, ...rest] = stats.tags.top
  const top = new Set(stats.tags.top.map((x) => x.tag))
  const lift = stats.tags.moodLift[0]
  const fresh = stats.tags.fresh.filter((tag) => !top.has(tag)).slice(0, 3)
  if (!first) return null
  return (
    <div className="slide-body">
      <h2 className="slide-title">{t('wrapped.topTag', { tag: `#${first.tag}`, count: first.days })}</h2>
      {rest.length > 0 && <p className="slide-lead">{t('wrapped.thenTags', { tags: list(rest.slice(0, 3).map((x) => x.tag)) })}</p>}
      {lift && <p className="slide-lead slide-quiet">{t('wrapped.brighterWith', { tag: `#${lift.tag}` })}</p>}
      {fresh.length > 0 && <p className="slide-lead slide-quiet">{t('wrapped.newTags', { tags: list(fresh) })}</p>}
    </div>
  )
}
