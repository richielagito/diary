/**
 * jsdom has no layout; ProseMirror asks for rects when it scrolls a focused cursor into view.
 * Call inside a test (or beforeEach); the stubs are removed when the test finishes.
 */
export function stubLayout() {
  const range = Range.prototype as Partial<Range>
  range.getClientRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList
  range.getBoundingClientRect = () => new DOMRect()
  document.elementFromPoint = () => null
  onTestFinished(() => {
    delete range.getClientRects
    delete range.getBoundingClientRect
    delete (document as Partial<Document>).elementFromPoint
  })
}
