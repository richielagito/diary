// Diverifikasi 2026-10-01 terhadap FAQ resmi Kemenkes untuk Healing119.id (kesprimkom.kemkes.go.id):
// panggilan 119 ext 8, chat WhatsApp lewat tombol di healing119.id, gratis, 24 jam.
// Nomor WhatsApp sengaja tidak ditulis di sini: sumber resminya adalah tombol di situs itu.
// Cek ulang secara berkala; layanan publik bisa berganti nama atau nomor.

export interface Helpline {
  id: string
  name: { id: string; en: string }
  contact: string
  href: string
}

export const HELPLINES: readonly Helpline[] = [
  {
    id: 'id-healing119',
    name: {
      id: 'Healing119.id, layanan kesehatan jiwa Kemenkes (telepon, gratis, 24 jam)',
      en: 'Healing119.id, Indonesian Ministry of Health mental health line (phone, free, 24 hours)',
    },
    contact: '119 ext 8',
    href: 'tel:119,8',
  },
  {
    id: 'id-healing119-chat',
    name: {
      id: 'Healing119.id lewat chat WhatsApp (kalau telepon sedang penuh)',
      en: 'Healing119.id by WhatsApp chat (if the phone line is busy)',
    },
    contact: 'healing119.id',
    href: 'https://www.healing119.id',
  },
  { id: 'emergency', name: { id: 'Nomor darurat', en: 'Emergency number' }, contact: '112', href: 'tel:112' },
  {
    id: 'findahelpline',
    name: { id: 'Layanan krisis di negara lain', en: 'Crisis lines in other countries' },
    contact: 'findahelpline.com',
    href: 'https://findahelpline.com',
  },
]
