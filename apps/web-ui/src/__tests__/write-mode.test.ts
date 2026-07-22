import { describe, it, expect, beforeEach, afterEach } from "bun:test";

const { markdownToHtml, escapeHtml } = await import("../static/app.js");

describe("markdown rendering (marked + DOMPurify)", () => {
  describe("minimal fallback renderer", () => {
    it("renders empty string for falsy input", () => {
      expect(markdownToHtml("")).toBe("");
      expect(markdownToHtml(null)).toBe("");
      expect(markdownToHtml(undefined)).toBe("");
    });

    it("renders a heading", () => {
      const html = markdownToHtml("# Title");
      expect(html).toContain("<h1>");
      expect(html).toContain("Title");
      expect(html).toContain("</h1>");
    });

    it("renders bold and italic", () => {
      const html = markdownToHtml("**bold** and *italic*");
      expect(html).toContain("<strong>bold</strong>");
      expect(html).toContain("<em>italic</em>");
    });

    it("renders inline code", () => {
      const html = markdownToHtml("Use `code` here");
      expect(html).toContain("<code>code</code>");
    });

    it("renders fenced code block", () => {
      const html = markdownToHtml("```ts\nconst x = 1;\n```");
      expect(html).toContain("<pre><code");
      expect(html).toContain("const x = 1;");
      expect(html).toContain("</code></pre>");
    });

    it("renders unordered list", () => {
      const html = markdownToHtml("- item1\n- item2");
      expect(html).toContain("<ul>");
      expect(html).toContain("<li>item1</li>");
      expect(html).toContain("<li>item2</li>");
      expect(html).toContain("</ul>");
    });

    it("renders ordered list", () => {
      const html = markdownToHtml("1. first\n2. second");
      expect(html).toContain("<ol>");
      expect(html).toContain("<li>first</li>");
      expect(html).toContain("<li>second</li>");
      expect(html).toContain("</ol>");
    });

    it("escapes raw HTML to prevent XSS (fallback renderer)", () => {
      const html = markdownToHtml("<script>alert('xss')</script>");
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });

    it("renders a link with safe URL", () => {
      const html = markdownToHtml("[text](https://example.com)");
      expect(html).toContain('<a href="https://example.com"');
      expect(html).toContain("text");
    });
  });

  describe("marked + DOMPurify path (when libraries available)", () => {
    const originalMarked = globalThis.marked;
    const originalDOMPurify = globalThis.DOMPurify;

    afterEach(() => {
      if (originalMarked) globalThis.marked = originalMarked;
      else delete globalThis.marked;
      if (originalDOMPurify) globalThis.DOMPurify = originalDOMPurify;
      else delete globalThis.DOMPurify;
    });

    it("uses marked + DOMPurify when available, sanitizing XSS", () => {
      globalThis.marked = {
        parse: (text) => text.replace(/`([^`]+)`/g, "<code>$1</code>"),
      };
      globalThis.DOMPurify = {
        sanitize: (html) => html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ""),
      };

      const html = markdownToHtml("Use `code` here");
      expect(html).toContain("<code>code</code>");
    });

    it("DOMPurify strips script tags (F4 XSS mitigation)", () => {
      globalThis.marked = {
        parse: (text) => text,
      };
      globalThis.DOMPurify = {
        sanitize: (html) => html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ""),
      };

      const html = markdownToHtml("<script>alert('xss')</script>");
      expect(html).not.toContain("<script>");
      expect(html).not.toContain("alert");
    });

    it("renders markdown tables via marked", () => {
      const tableMd = "| Col1 | Col2 |\n|------|------|\n| a | b |";
      globalThis.marked = {
        parse: (text) => {
          if (text.includes("|")) return "<table><tr><td>a</td><td>b</td></tr></table>";
          return text;
        },
      };
      globalThis.DOMPurify = {
        sanitize: (html) => html,
      };

      const html = markdownToHtml(tableMd);
      expect(html).toContain("<table>");
      expect(html).toContain("<td>a</td>");
    });

    it("falls back to minimal renderer when marked throws", () => {
      globalThis.marked = {
        parse: () => {
          throw new Error("parse error");
        },
      };
      globalThis.DOMPurify = {
        sanitize: (html) => html,
      };

      const html = markdownToHtml("# Title");
      expect(html).toContain("<h1>");
    });
  });
});