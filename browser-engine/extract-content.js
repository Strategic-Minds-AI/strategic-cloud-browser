/**
 * Extract either an explicit element or the full browser document.
 * Keep selector resolution (including XPath) in the caller's locate helper.
 */
export async function extractText(page, selector, locate) {
  const target = selector ? await locate(page, selector) : page.locator("body");
  return target.innerText();
}

export async function extractHtml(page, selector, locate) {
  if (!selector) return page.content();
  const target = await locate(page, selector);
  return target.innerHTML();
}
