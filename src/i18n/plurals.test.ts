import { i18n } from '.'

test('English import counts use singular and plural forms', () => {
  const t = i18n.getFixedT('en')
  expect(t('import.newCount', { count: 1 })).toBe('1 new entry')
  expect(t('import.newCount', { count: 2 })).toBe('2 new entries')
  expect(t('import.conflictCount', { count: 1 })).toBe('1 entry conflicts with an existing one')
  expect(t('import.conflictCount', { count: 3 })).toBe('3 entries conflict with existing ones')
  expect(t('import.invalidCount', { count: 1 })).toBe('1 invalid file')
  expect(t('import.invalidCount', { count: 2 })).toBe('2 invalid files')
})

test('Indonesian import counts keep the same text for every count', () => {
  const t = i18n.getFixedT('id')
  expect(t('import.newCount', { count: 1 })).toBe('1 entri baru')
  expect(t('import.newCount', { count: 2 })).toBe('2 entri baru')
})

test('English stats and Wrapped counts use singular and plural forms', () => {
  const t = i18n.getFixedT('en')
  expect(t('stats.streakDays', { count: 1 })).toBe('1 day')
  expect(t('stats.streakDays', { count: 0 })).toBe('0 days')
  expect(t('stats.moodDays', { count: 1 })).toBe('1 day')
  expect(t('stats.moodDays', { count: 2 })).toBe('2 days')
  expect(t('stats.tagDays', { count: 1 })).toBe('1 day')
  expect(t('stats.tagDays', { count: 4 })).toBe('4 days')
  expect(t('stats.cellWords', { count: 1, words: '1' })).toBe('1 word')
  expect(t('stats.cellWords', { count: 1200, words: '1,200' })).toBe('1,200 words')
  expect(t('stats.daysWrittenValue', { count: 1, days: '1', total: '1', percent: '100' })).toBe('1 of 1 day (100%)')
  expect(t('stats.daysWrittenValue', { count: 10, days: '1', total: '10', percent: '10' })).toBe('1 of 10 days (10%)')
  expect(t('wrapped.openingMonth', { count: 1, period: 'October 2026', days: '1' })).toBe('October 2026, you wrote 1 day')
  expect(t('wrapped.openingYear', { count: 214, period: '2026', days: '214' })).toBe('2026, you wrote 214 days')
  expect(t('wrapped.totalWords', { count: 1, words: '1' })).toBe('1 word written')
  expect(t('wrapped.totalWords', { count: 58300, words: '58,300' })).toBe('58,300 words written')
  expect(t('wrapped.longestStreak', { count: 1 })).toBe('Longest streak 1 day')
  expect(t('wrapped.longestStreak', { count: 3 })).toBe('Longest streak 3 days')
})

test('Indonesian stats and Wrapped counts keep the same text for every count', () => {
  const t = i18n.getFixedT('id')
  expect(t('stats.streakDays', { count: 1 })).toBe('1 hari')
  expect(t('stats.streakDays', { count: 2 })).toBe('2 hari')
  expect(t('stats.cellWords', { count: 1, words: '1' })).toBe('1 kata')
  expect(t('stats.daysWrittenValue', { count: 1, days: '1', total: '1', percent: '100' })).toBe('1 dari 1 hari (100%)')
  expect(t('wrapped.openingYear', { count: 1, period: '2026', days: '1' })).toBe('2026, kamu menulis 1 hari')
  expect(t('wrapped.totalWords', { count: 1, words: '1' })).toBe('1 kata tertulis')
  expect(t('wrapped.longestStreak', { count: 1 })).toBe('Streak terpanjang 1 hari')
})
