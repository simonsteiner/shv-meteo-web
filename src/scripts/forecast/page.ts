// What the forecast sections share in the browser.

/** The forecast page around a section, whose words (the section links
 * too) the section's script fills; the section itself on a page without
 * the frame. */
export function page(section: HTMLElement): HTMLElement {
  return section.closest<HTMLElement>("[data-forecast]") ?? section;
}
