import type { GetPageContentMessage, PageContentResponseMessage } from "./lib/types";

const STRIP_SELECTORS = [
  "nav",
  "header",
  "footer",
  "aside",
  "script",
  "style",
  "noscript",
  "iframe",
  '[role="navigation"]',
  '[role="banner"]',
  '[role="complementary"]',
  '[role="contentinfo"]',
  '[class*="sidebar"]',
  '[id*="sidebar"]',
  '[class*="ad-"]',
  '[id*="ad-"]',
  '[class*="advertisement"]',
  '[class*="cookie"]',
  '[class*="popup"]',
  '[class*="modal"]',
  '[class*="newsletter"]',
  '[class*="subscribe"]',
];

function extractPageText(): string {
  // Prefer highlighted text if the user has selected something
  const selection = window.getSelection();
  if (selection && selection.toString().trim().length > 50) {
    return selection.toString().trim();
  }

  // Clone body to avoid mutating the live DOM
  const clone = document.body.cloneNode(true) as HTMLElement;

  // Remove boilerplate elements
  STRIP_SELECTORS.forEach((selector) => {
    clone.querySelectorAll(selector).forEach((el) => el.remove());
  });

  // Collapse excess whitespace
  const text = clone.innerText
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return text;
}

chrome.runtime.onMessage.addListener(
  (message: GetPageContentMessage, _sender, sendResponse) => {
    if (message.type !== "GET_PAGE_CONTENT") return;

    const text = extractPageText();
    const response: PageContentResponseMessage = {
      type: "PAGE_CONTENT_RESPONSE",
      text,
      title: document.title,
      url: location.href,
    };
    sendResponse(response);
  }
);

export {};
