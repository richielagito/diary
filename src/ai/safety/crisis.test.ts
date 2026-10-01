import { detectCrisis } from './crisis'
import { HELPLINES } from './helplines'

test.each([
  'Aku pengen mati aja rasanya',
  'kadang kepikiran BUNUH DIRI',
  'rasanya mau mengakhiri hidup.',
  'aku sering menyakiti diri sendiri',
  'aku udah gak mau hidup lagi',
  'nggak mau hidup lagi',
  'I want to die',
  'thinking about self-harm again',
  'feeling suicidal tonight',
  'I might kill myself',
  'aku capek hidup kayak gini',
  'pengen hilang aja dari dunia',
  'I don\'t want to live anymore',
  'everyone would be better off dead without me',
  'aku pengin mati',
  'pengen gantung diri',
  'gamau hidup lagi',
  'I just want to end it all',
  'I wish I was dead',
  'I wish I were dead',
  'gak pengen hidup lagi',
])('detects crisis phrase: %s', (text) => {
  expect(detectCrisis(text)).toBe(true)
})

test.each([
  'mati lampu lagi di rumah',
  'mati gaya banget hari ini',
  'deadline bikin mati kutu',
  'bunuh nyamuk semalaman',
  'hari ini capek tapi senang',
  'capek kerja hari ini',
  'hilang kunci motor',
  'cut the vegetables',
  '',
])('does not flag: %s', (text) => {
  expect(detectCrisis(text)).toBe(false)
})

test('helplines have contacts and safe links', () => {
  expect(HELPLINES.length).toBeGreaterThanOrEqual(3)
  for (const h of HELPLINES) {
    expect(h.contact).not.toBe('')
    expect(h.href).toMatch(/^(tel:|https:\/\/)/)
  }
})

test('the Healing119 phone link dials extension 8 after connecting', () => {
  expect(HELPLINES.find((h) => h.id === 'id-healing119')?.href).toBe('tel:119,8')
})
