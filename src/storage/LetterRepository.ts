export interface LetterRecord {
  /** 'YYYY-MM' atau 'YYYY' */
  periodId: string
  text: string
  /** Hash input + model saat surat ditulis; beda berarti data sudah berubah. */
  fingerprint: string
  createdAt: number
}

export interface LetterRepository {
  get(periodId: string): Promise<LetterRecord | undefined>
  put(letter: LetterRecord): Promise<void>
  clear(): Promise<void>
}
