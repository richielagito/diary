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
