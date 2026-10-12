/**
 * Bring `el` into view by scrolling ONLY its nearest scroll container.
 *
 * `Element.scrollIntoView` scrolls every scrollable ancestor — including an
 * `overflow: hidden` box (still programmatically scrollable) and the document.
 * In a fixed-height workspace (the kit) that shifts the whole shell up and
 * leaves the screen blank under the top bar. When nothing between `el` and
 * the document scrolls (a stacked, page-scrolling layout), the page scrolls
 * as usual.
 */
export type ScrollBlock = "start" | "center" | "end";

function scrollParent(el: Element): HTMLElement | null {
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}

export function scrollIntoViewWithin(el: Element | null | undefined, block: ScrollBlock = "end"): void {
  if (!el) return;
  const box = scrollParent(el);
  if (!box) {
    el.scrollIntoView({ behavior: "smooth", block });
    return;
  }
  const target = el.getBoundingClientRect();
  const frame = box.getBoundingClientRect();
  const offset =
    block === "start"
      ? target.top - frame.top
      : block === "center"
        ? target.top + target.height / 2 - (frame.top + frame.height / 2)
        : target.bottom - frame.bottom;
  box.scrollTo({ top: box.scrollTop + offset, behavior: "smooth" });
}
