/**
 * Markdown → safe HTML, with a built-in fallback renderer.
 *
 * Stored memory/handoff/proposal content is rendered as markdown, so this is an
 * XSS surface: `marked` output always goes through `DOMPurify`, and the
 * fallback escapes every raw character before it does anything else.
 */

import { escapeHtml } from "./html.js";

/**
 * Render markdown to safe HTML using marked + DOMPurify.
 * Falls back to the built-in minimal renderer when the CDN libraries are not
 * loaded (e.g., in test environments without a DOM).
 *
 * SECURITY: never use raw innerHTML with unsanitized markdown output.
 * DOMPurify.sanitize() strips XSS vectors (scripts, event handlers, etc.).
 * F4 mitigation: stored markdown cannot inject scripts.
 */
export function markdownToHtml(md) {
  if (!md) return "";
  const text = String(md);

  // Use marked + DOMPurify when available (browser with CDN scripts loaded)
  if (typeof globalThis !== "undefined") {
    const markedLib = globalThis.marked;
    const purifyLib = globalThis.DOMPurify;
    if (markedLib && purifyLib) {
      try {
        const rawHtml = markedLib.parse(text);
        return purifyLib.sanitize(rawHtml);
      } catch {
        // fall through to minimal renderer on parse error
      }
    }
  }

  // Fallback: minimal built-in renderer (no table support, but safe)
  return _minimalMarkdownToHtml(text);
}

/**
 * Minimal built-in markdown renderer — escapes all raw text first so injected
 * HTML/tags cannot execute. Used as fallback when marked/DOMPurify are not
 * available (tests, non-browser). Supported: headings, bold, italic, inline
 * code, fenced code blocks, lists, links, paragraphs.
 */
function _minimalMarkdownToHtml(md) {
  const lines = String(md).replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;
  let inUl = false;
  let inOl = false;
  let para = [];

  const flushLists = () => {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      out.push("</ol>");
      inOl = false;
    }
  };
  const flushPara = () => {
    if (para.length > 0) {
      out.push("<p>" + inline(para.join(" ")) + "</p>");
      para = [];
    }
  };

  function inline(text) {
    let t = escapeHtml(text);
    const codeStash = [];
    t = t.replace(/`([^`]+)`/g, (_m, c) => {
      codeStash.push(c);
      return "@@MASSA_AICODE" + (codeStash.length - 1) + "@@";
    });
    t = t.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
      (_m, label, url) =>
        '<a href="' + url + '" rel="noopener noreferrer" target="_blank">' + label + "</a>",
    );
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    t = t.replace(/@@MASSA_AICODE(\d+)@@/g, (_m, idx) => "<code>" + codeStash[Number(idx)] + "</code>");
    return t;
  }

  while (i < lines.length) {
    const line = lines[i];

    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      flushPara();
      flushLists();
      const lang = fence[1] || "";
      const codeLines = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      const cls = lang ? ' class="language-' + escapeHtml(lang) + '"' : "";
      out.push("<pre><code" + cls + ">" + escapeHtml(codeLines.join("\n")) + "</code></pre>");
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      flushLists();
      const level = h[1].length;
      out.push("<h" + level + ">" + inline(h[2]) + "</h" + level + ">");
      i++;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      flushPara();
      if (inOl) {
        out.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        out.push("<ul>");
        inUl = true;
      }
      out.push("<li>" + inline(line.replace(/^\s*[-*]\s+/, "")) + "</li>");
      i++;
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      flushPara();
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        out.push("<ol>");
        inOl = true;
      }
      out.push("<li>" + inline(line.replace(/^\s*\d+\.\s+/, "")) + "</li>");
      i++;
      continue;
    }

    if (line.trim() === "") {
      flushPara();
      flushLists();
      i++;
      continue;
    }

    flushLists();
    para.push(line);
    i++;
  }
  flushPara();
  flushLists();
  return out.join("\n");
}
