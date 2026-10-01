export function wordCount(markdown: string): number {
  const text = markdown
    .replace(/^(`{3,}|~{3,}).*$/gm, ' ') // baris pagar kode
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // link -> teksnya saja
    .replace(/^\s*(#{1,6}|>+|[-*+]|\d+[.)])\s+/gm, ' ') // penanda blok
    .replace(/\[[ xX]\]/g, ' ') // checkbox
    .replace(/^\s*([-*_])(\s*\1){2,}\s*$/gm, ' ') // horizontal rule
    .replace(/[*_~`]/g, ' ') // emphasis dan inline code
  return text.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length
}
