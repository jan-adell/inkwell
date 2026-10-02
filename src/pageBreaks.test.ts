import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("writing panel stylesheet", () => {
  it("does not draw page break stripes across the sheet", () => {
    const css = readFileSync(join(__dirname, "index.css"), "utf8");

    expect(css).not.toContain("repeating-linear-gradient");
  });
});
