/** Line icons drawn in one stroke weight; decorative, so the control carries the label. */
function Icon({ d }: { d: string }) {
  return (
    <svg className="icon" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

export const ChevronLeft = () => <Icon d="M12.5 4.5 7 10l5.5 5.5" />
export const ChevronRight = () => <Icon d="M7.5 4.5 13 10l-5.5 5.5" />
export const Close = () => <Icon d="M5 5l10 10M15 5 5 15" />
export const Settings = () => <Icon d="M3.5 6h8m4 0h1M3.5 14h1m4 0h8M13.5 3.75v4.5M6.5 11.75v4.5" />
export const Send = () => <Icon d="M10 16V4.5M5 9.5l5-5 5 5" />
export const Stop = () => <Icon d="M6.5 6.5h7v7h-7z" />
