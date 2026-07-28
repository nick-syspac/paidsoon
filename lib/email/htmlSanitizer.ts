import sanitizeHtmlLib from "sanitize-html"

/**
 * Shared HTML sanitisation allow-list, used both when rendering outbound
 * emails (`lib/email/send.ts`) and when rendering a previously-sent email's
 * body in the dashboard's read-only detail modal (`components/dashboard/`).
 *
 * This module has no server-only imports (no `prismaAdmin`, no `resend`) so
 * it is safe to import from a `"use client"` component.
 */
const SANITIZE_OPTIONS: sanitizeHtmlLib.IOptions = {
  allowedTags: [
    "p", "br", "strong", "em", "u", "s", "ul", "ol", "li",
    "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "a", "span", "div",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    span: ["style"],
    p: ["style"],
  },
  allowedSchemes: ["https", "http", "mailto"],
  disallowedTagsMode: "discard",
}

export function sanitizeHtml(html: string): string {
  return sanitizeHtmlLib(html, SANITIZE_OPTIONS)
}
