export type PersonaStyle = 'hangat' | 'santai' | 'gaul' | 'formal'

export const PERSONA_STYLES: readonly PersonaStyle[] = ['hangat', 'santai', 'gaul', 'formal']

export interface PersonaSettings {
  style: PersonaStyle
  name: string
  customInstruction: string
}

export const DEFAULT_PERSONA: PersonaSettings = { style: 'hangat', name: 'Teman', customInstruction: '' }

export const PERSONA_MAX_INSTRUCTION = 500

export const STYLE_GUIDE: Record<PersonaStyle, string> = {
  hangat: 'warm, gentle and empathetic, like a caring close friend.',
  santai: 'relaxed and casual, light-hearted but still attentive.',
  gaul: 'casual everyday Indonesian slang (for example "aku/kamu", "banget", "sih", "deh", "kok") when replying in Indonesian; playful but always respectful and kind.',
  formal: 'formal and polite; when replying in Indonesian use standard Bahasa Indonesia and address the user as "Anda".',
}
