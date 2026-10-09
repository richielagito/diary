import { addDays, dateKey, parseDateKey } from '../domain/date'
import { extractTags } from '../domain/tags'
import type { DayEntry, Mood } from '../domain/types'
import { wordCount } from '../domain/wordCount'
import type { ChatMessage } from '../storage/ChatRepository'
import type { DiaryDB } from '../storage/db'
import type { Memory } from '../storage/MemoryRepository'

/** Lines grouped by the mood they fit, so a day's text and its mood agree. */
const LINES: Record<Mood, string[]> = {
  5: [
    'Lari pagi lima kilometer tanpa berhenti. Kaki pegal, kepala jernih. #olahraga',
    'Presentasi rilis berjalan mulus, tim tepuk tangan di akhir. #kerja',
    'Makan malam bareng keluarga, Ibu masak rendang kesukaanku. #keluarga',
    'Ketemu Sari setelah tiga bulan. Ngobrol sampai kedai kopinya tutup. #teman',
  ],
  4: [
    'Baca dua bab novel sebelum tidur. Tokohnya mengingatkanku pada nenek. #baca',
    'Beres-beres kamar, menemukan surat lama dari SMA. Senyum sendiri. #rumah',
    'Masak nasi goreng pertama yang benar-benar enak. #masak',
    'Jalan sore ke taman, lihat anak-anak main layangan. #jalan',
  ],
  3: [
    'Hari biasa. Kerja, makan siang di meja, pulang naik kereta. #kerja',
    'Hujan seharian, jadi di rumah saja nonton film lama. #rumah',
    'Rapat panjang soal anggaran. Tidak buruk, tidak juga menyenangkan. #kerja',
    'Belanja mingguan dan cuci baju. Hari yang rapi. #rumah',
  ],
  2: [
    'Kurang tidur, kepala berat sepanjang hari. #kesehatan',
    'Tenggat dimajukan dua hari. Lembur sampai jam sembilan. #kerja',
    'Salah paham kecil dengan Dimas. Belum sempat bicara lagi. #teman',
  ],
  1: [
    'Hari yang berat. Tidak banyak yang ingin kutulis. #keluarga',
    'Kabar dari rumah sakit kurang baik. Semoga besok lebih ringan. #keluarga',
  ],
}

/** A longer day, to show headings and lists in the editor and the archive. */
const LONG = `## Pagi
Bangun sebelum alarm, sempat menyeduh kopi dengan tenang.

## Yang selesai hari ini
- Draf laporan bulanan
- Telepon Ibu
- Ganti lampu dapur

Sore ditutup dengan jalan kaki keliling kompleks. #rumah #keluarga`

/**
 * Development only: a believable year of diary, chats and memories, so every screen has something to show.
 * Deterministic, relative to today; written once into the separate demo database (see main.tsx).
 */
export async function seedDemo(db: DiaryDB) {
  let s = 7
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]
  const today = dateKey()
  const now = Date.now()
  const at = (date: string, hour: number) => parseDateKey(date).getTime() + hour * 3_600_000

  const entries: DayEntry[] = []
  for (let date = addDays(today, -300); date <= today; date = addDays(date, 1)) {
    if (date !== today && rnd() < 0.3) continue
    // Moods drift by season, with good and bad stretches, so the heatmap and the trends have a shape.
    const month = parseDateKey(date).getMonth()
    const lean = month === 8 ? -0.8 : month === 4 || month === 11 ? 0.7 : 0
    const mood = rnd() < 0.07 ? null : (Math.min(5, Math.max(1, Math.round(3.2 + lean + (rnd() - 0.5) * 3.2))) as Mood)
    const pool = LINES[mood ?? 3]
    const markdown =
      rnd() < 0.06 ? LONG : Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pick(pool)).filter((l, i, a) => a.indexOf(l) === i).join('\n\n')
    entries.push({ date, markdown, mood, tags: extractTags(markdown), wordCount: wordCount(markdown), createdAt: at(date, 21), updatedAt: at(date, 21) })
  }

  const chat = (date: string, lines: [ChatMessage['role'], string][]): ChatMessage[] =>
    lines.map(([role, content], i) => ({ id: `demo-${date}-${i}`, date, role, content, createdAt: at(date, 20) + i * 60_000, status: 'complete' }))
  const chats = [
    ...chat(addDays(today, -6), [
      ['user', 'Minggu ini rasanya panjang sekali.'],
      ['assistant', 'Kedengarannya melelahkan. Bagian mana yang paling menguras tenaga?'],
      ['user', 'Tenggat yang dimajukan. Tapi akhirnya selesai juga.'],
      ['assistant', 'Selesai di bawah tekanan itu bukan hal kecil. Semoga akhir pekan ini bisa sedikit lebih pelan.'],
    ]),
    ...chat(addDays(today, -2), [
      ['user', 'Tadi ketemu Sari lagi, senang banget.'],
      ['assistant', 'Senang mendengarnya! Apa yang paling kamu ingat dari obrolan kalian?'],
    ]),
    ...chat(today, [
      ['user', 'Hari ini rapatnya molor terus, tapi sorenya sempat jalan ke taman.'],
      ['assistant', 'Jalan sore setelah hari yang padat itu seperti napas panjang. Bagaimana rasanya sekarang?'],
    ]),
  ]

  const memory = (id: string, text: string, source: Memory['source']): Memory => ({ id: `demo-${id}`, text, source, createdAt: now, updatedAt: now })
  const memories = [
    memory('1', 'Suka lari pagi di akhir pekan.', 'auto'),
    memory('2', 'Punya teman dekat bernama Sari.', 'user'),
    memory('3', 'Bekerja di tim produk, sering rapat soal rilis.', 'auto'),
    memory('4', 'Ibu tinggal di kota lain; sering telepon di malam hari.', 'auto'),
  ]

  await db.transaction('rw', db.entries, db.chatMessages, db.memories, db.settings, async () => {
    await db.entries.bulkPut(entries)
    await db.chatMessages.bulkPut(chats)
    await db.memories.bulkPut(memories)
    // A backup a few days old: the reminder stays quiet, and Settings shows what changed since.
    await db.settings.put({ key: 'lastExportAt', value: now - 4 * 86_400_000 })
  })
}
