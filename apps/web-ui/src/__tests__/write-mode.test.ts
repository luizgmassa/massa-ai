import { describe, it, expect, afterEach } from "bun:test";

const { markdownToHtml, isWriteModeEnabled, renderMemoryBrowser, renderProposals, renderHandoffs, renderCheckpoints, renderProjects } = await import("../static/app.js");

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
    const originalMarked = (globalThis as any).marked;
    const originalDOMPurify = (globalThis as any).DOMPurify;

    afterEach(() => {
      if (originalMarked) (globalThis as any).marked = originalMarked;
      else delete (globalThis as any).marked;
      if (originalDOMPurify) (globalThis as any).DOMPurify = originalDOMPurify;
      else delete (globalThis as any).DOMPurify;
    });

    it("uses marked + DOMPurify when available, sanitizing XSS", () => {
      (globalThis as any).marked = {
        parse: (text: string) => text.replace(/`([^`]+)`/g, "<code>$1</code>"),
      };
      (globalThis as any).DOMPurify = {
        sanitize: (html: string) => html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ""),
      };

      const html = markdownToHtml("Use `code` here");
      expect(html).toContain("<code>code</code>");
    });

    it("DOMPurify strips script tags (F4 XSS mitigation)", () => {
      (globalThis as any).marked = {
        parse: (text: string) => text,
      };
      (globalThis as any).DOMPurify = {
        sanitize: (html: string) => html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ""),
      };

      const html = markdownToHtml("<script>alert('xss')</script>");
      expect(html).not.toContain("<script>");
      expect(html).not.toContain("alert");
    });

    it("renders markdown tables via marked", () => {
      const tableMd = "| Col1 | Col2 |\n|------|------|\n| a | b |";
      (globalThis as any).marked = {
        parse: (text: string) => {
          if (text.includes("|")) return "<table><tr><td>a</td><td>b</td></tr></table>";
          return text;
        },
      };
      (globalThis as any).DOMPurify = {
        sanitize: (html: string) => html,
      };

      const html = markdownToHtml(tableMd);
      expect(html).toContain("<table>");
      expect(html).toContain("<td>a</td>");
    });

    it("falls back to minimal renderer when marked throws", () => {
      (globalThis as any).marked = {
        parse: () => {
          throw new Error("parse error");
        },
      };
      (globalThis as any).DOMPurify = {
        sanitize: (html: string) => html,
      };

      const html = markdownToHtml("# Title");
      expect(html).toContain("<h1>");
    });
  });
});

describe("write mode gating", () => {
  const originalWriteMode = (globalThis as any).MASSA_AI_WEB_WRITE_MODE;
  const originalDocument = (globalThis as any).document;
  const originalLocalStorage = (globalThis as any).localStorage;

  afterEach(() => {
    if (originalWriteMode !== undefined) {
      (globalThis as any).MASSA_AI_WEB_WRITE_MODE = originalWriteMode;
    } else {
      delete (globalThis as any).MASSA_AI_WEB_WRITE_MODE;
    }
    if (originalDocument !== undefined) {
      (globalThis as any).document = originalDocument;
    } else {
      delete (globalThis as any).document;
    }
    if (originalLocalStorage !== undefined) {
      (globalThis as any).localStorage = originalLocalStorage;
    } else {
      delete (globalThis as any).localStorage;
    }
  });

  it("isWriteModeEnabled returns false by default when no trusted meta tag and no opt-in", () => {
    delete (globalThis as any).MASSA_AI_WEB_WRITE_MODE;
    delete (globalThis as any).document;
    delete (globalThis as any).localStorage;
    expect(isWriteModeEnabled()).toBe(false);
  });

  it("isWriteModeEnabled returns true when MASSA_AI_WEB_WRITE_MODE=true (force-on seam)", () => {
    delete (globalThis as any).document;
    delete (globalThis as any).localStorage;
    (globalThis as any).MASSA_AI_WEB_WRITE_MODE = true;
    expect(isWriteModeEnabled()).toBe(true);
  });

  it("isWriteModeEnabled returns true when trusted meta tag present (F1 default-ON)", () => {
    delete (globalThis as any).MASSA_AI_WEB_WRITE_MODE;
    delete (globalThis as any).localStorage;
    (globalThis as any).document = {
      querySelector(sel: string) {
        if (sel === 'meta[name="massa-ai-api-key"]') {
          return { getAttribute(name: string) { return name === "content" ? "test-key-123" : null; } };
        }
        return null;
      },
    };
    expect(isWriteModeEnabled()).toBe(true);
  });

  it("isWriteModeEnabled returns false when MASSA_AI_WEB_WRITE_MODE=false overrides trusted tag (opt-out)", () => {
    (globalThis as any).document = {
      querySelector(sel: string) {
        if (sel === 'meta[name="massa-ai-api-key"]') {
          return { getAttribute(name: string) { return name === "content" ? "test-key-123" : null; } };
        }
        return null;
      },
    };
    delete (globalThis as any).localStorage;
    (globalThis as any).MASSA_AI_WEB_WRITE_MODE = false;
    expect(isWriteModeEnabled()).toBe(false);
  });

  it("isWriteModeEnabled returns false when localStorage massa-ai-write-mode=false overrides trusted tag (opt-out)", () => {
    (globalThis as any).document = {
      querySelector(sel: string) {
        if (sel === 'meta[name="massa-ai-api-key"]') {
          return { getAttribute(name: string) { return name === "content" ? "test-key-123" : null; } };
        }
        return null;
      },
    };
    (globalThis as any).localStorage = {
      getItem(key: string) { return key === "massa-ai-write-mode" ? "false" : null; },
      setItem() {},
      removeItem() {},
    };
    delete (globalThis as any).MASSA_AI_WEB_WRITE_MODE;
    expect(isWriteModeEnabled()).toBe(false);
  });

  it("isWriteModeEnabled returns true when localStorage massa-ai-write-mode=true without trusted tag", () => {
    delete (globalThis as any).document;
    (globalThis as any).localStorage = {
      getItem(key: string) { return key === "massa-ai-write-mode" ? "true" : null; },
      setItem() {},
      removeItem() {},
    };
    delete (globalThis as any).MASSA_AI_WEB_WRITE_MODE;
    expect(isWriteModeEnabled()).toBe(true);
  });

  it("renderMemoryBrowser hides edit/delete buttons when write mode off", () => {
    delete (globalThis as any).MASSA_AI_WEB_WRITE_MODE;
    delete (globalThis as any).document;
    delete (globalThis as any).localStorage;
    const data = { data: { memories: [{ id: "mem-1", type: "code", level: 1, importance: 0.8, content: "test" }], total: 1, limit: 50, offset: 0 } };
    const html = renderMemoryBrowser(data, { filters: {} });
    expect(html).not.toContain('data-action="memory-edit"');
    expect(html).not.toContain('data-action="memory-delete"');
    expect(html).not.toContain("actions");
  });

  it("renderMemoryBrowser shows edit/delete buttons when write mode on", () => {
    delete (globalThis as any).document;
    delete (globalThis as any).localStorage;
    (globalThis as any).MASSA_AI_WEB_WRITE_MODE = true;
    const data = { data: { memories: [{ id: "mem-1", type: "code", level: 1, importance: 0.8, content: "test" }], total: 1, limit: 50, offset: 0 } };
    const html = renderMemoryBrowser(data, { filters: {} });
    expect(html).toContain('data-action="memory-edit"');
    expect(html).toContain('data-action="memory-delete"');
    expect(html).toContain('data-id="mem-1"');
  });

  it("renderProposals shows approve/reject buttons when write mode on", () => {
    delete (globalThis as any).document;
    delete (globalThis as any).localStorage;
    (globalThis as any).MASSA_AI_WEB_WRITE_MODE = true;
    const data = { data: { proposals: [{ id: "prop-1", type: "edit", status: "pending", description: "test proposal" }] } };
    const html = renderProposals(data, { project: "test-project" });
    expect(html).toContain('data-action="proposal-approve"');
    expect(html).toContain('data-action="proposal-reject"');
    expect(html).toContain('data-id="prop-1"');
  });

  it("renderProposals hides approve/reject buttons when write mode off", () => {
    delete (globalThis as any).MASSA_AI_WEB_WRITE_MODE;
    delete (globalThis as any).document;
    delete (globalThis as any).localStorage;
    const data = { data: { proposals: [{ id: "prop-1", type: "edit", status: "pending", description: "test proposal" }] } };
    const html = renderProposals(data, { project: "test-project" });
    expect(html).not.toContain('data-action="proposal-approve"');
    expect(html).not.toContain('data-action="proposal-reject"');
  });
});

// ── T13: create/delete forms render correct fields (MEM-02, HAND-02, CHKP-02, PROJ-02/04) ──

describe("T13 create/delete forms render correct fields when trusted", () => {
  const originalWriteMode = (globalThis as any).MASSA_AI_WEB_WRITE_MODE;
  const originalDocument = (globalThis as any).document;
  const originalLocalStorage = (globalThis as any).localStorage;

  afterEach(() => {
    if (originalWriteMode !== undefined) (globalThis as any).MASSA_AI_WEB_WRITE_MODE = originalWriteMode;
    else delete (globalThis as any).MASSA_AI_WEB_WRITE_MODE;
    if (originalDocument !== undefined) (globalThis as any).document = originalDocument;
    else delete (globalThis as any).document;
    if (originalLocalStorage !== undefined) (globalThis as any).localStorage = originalLocalStorage;
    else delete (globalThis as any).localStorage;
  });

  function trustedOn() {
    delete (globalThis as any).localStorage;
    (globalThis as any).document = {
      querySelector(sel: string) {
        if (sel === 'meta[name="massa-ai-api-key"]') {
          return { getAttribute(name: string) { return name === "content" ? "trusted-key" : null; } };
        }
        return null;
      },
    };
  }

  it("memory create form fields present when trusted (MEM-02)", () => {
    trustedOn();
    const data = { data: { memories: [], total: 0, limit: 50, offset: 0 } };
    const html = renderMemoryBrowser(data, { filters: {} });
    expect(html).toContain('data-form="memory-create"');
    expect(html).toContain('data-create="content"');
    expect(html).toContain('data-create="type"');
    expect(html).toContain('data-create="importance"');
  });

  it("memory delete button visible when trusted (MEM-04)", () => {
    trustedOn();
    const data = { data: { memories: [{ id: "m-trust", type: "code", level: 1, importance: 0.8, content: "x" }], total: 1, limit: 50, offset: 0 } };
    const html = renderMemoryBrowser(data, { filters: {} });
    expect(html).toContain('data-action="memory-delete"');
    expect(html).toContain('data-id="m-trust"');
  });

  it("handoff create form + cancel button visible when trusted (HAND-02, HAND-04)", () => {
    trustedOn();
    const data = { data: { pending: [{ id: "h-trust", targetAgent: "x", status: "open", summary: "s" }] } };
    const html = renderHandoffs(data, { project: "p" });
    expect(html).toContain('data-action="handoff-create"');
    expect(html).toContain('data-action="handoff-cancel"');
    expect(html).toContain('data-id="h-trust"');
  });

  it("handoff edit + delete buttons visible when trusted (T12, HPC-01)", () => {
    trustedOn();
    const data = { data: { pending: [{ id: "h-trust", targetAgent: "x", status: "open", summary: "s" }] } };
    const html = renderHandoffs(data, { project: "p" });
    expect(html).toContain('data-action="handoff-edit"');
    expect(html).toContain('data-action="handoff-delete"');
  });

  it("proposal create form fields present when trusted (T13, HPC-02)", () => {
    trustedOn();
    const data = { data: { pending: [] } };
    const html = renderProposals(data, { project: "p" });
    expect(html).toContain('data-form="proposal-create"');
    expect(html).toContain('data-create="projectId"');
    expect(html).toContain('data-create="kind"');
    expect(html).toContain('data-create="payload"');
    expect(html).toContain('data-create="rationale"');
    expect(html).toContain('data-create="targetMemoryId"');
  });

  it("proposal edit + delete buttons visible when trusted (T13, HPC-02)", () => {
    trustedOn();
    const data = { data: { pending: [{ id: "prop-trust", type: "edit", status: "pending", description: "d" }] } };
    const html = renderProposals(data, { project: "p" });
    expect(html).toContain('data-action="proposal-edit"');
    expect(html).toContain('data-action="proposal-delete"');
    expect(html).toContain('data-id="prop-trust"');
  });

  it("checkpoint create + edit + delete buttons visible when trusted (CHKP-02, CHKP-04, UIC-03)", () => {
    trustedOn();
    const data = { success: true, data: { checkpoints: [{ id: "c-trust", taskId: "t1", type: "manual", status: "completed", description: "d" }] } };
    const html = renderCheckpoints(data);
    expect(html).toContain('data-action="checkpoint-create"');
    expect(html).toContain('data-action="checkpoint-edit"');
    expect(html).toContain('class="btn-edit"');
    expect(html).toContain('data-action="checkpoint-delete"');
  });

  it("project index + reset buttons visible when trusted (PROJ-02, PROJ-04)", () => {
    trustedOn();
    const html = renderProjects({ projects: [{ projectId: "p-trust", documentCount: 5 }] });
    expect(html).toContain('data-action="project-index"');
    expect(html).toContain('data-action="project-reset"');
  });
});