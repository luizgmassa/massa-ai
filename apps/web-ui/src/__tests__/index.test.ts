import { describe, it, expect } from "bun:test";
import { WEB_UI_PACKAGE_MARKER } from "../index";

describe("web-ui package marker", () => {
  it("exports the package marker constant", () => {
    expect(WEB_UI_PACKAGE_MARKER).toBe("@massa-ai/web-ui");
  });
});
