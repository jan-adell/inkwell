import { describe, expect, it } from "vitest";
import { findEntityMatches } from "./entityHighlight";

const e = (id: string, name: string) => ({ id, name });

describe("findEntityMatches", () => {
  it("returns empty array when no entities given", () => {
    expect(findEntityMatches("Aragorn rode through the night", [])).toEqual([]);
  });

  it("returns empty array when text has no matching entity names", () => {
    const entities = [e("1", "Legolas"), e("2", "Gimli")];
    expect(findEntityMatches("Aragorn rode through the night", entities)).toEqual([]);
  });

  it("matches entity name at correct character positions", () => {
    const entities = [e("1", "Aragorn")];
    const matches = findEntityMatches("Aragorn rode", entities);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ entityId: "1", name: "Aragorn", start: 0, end: 7 });
  });

  it("matches case-insensitively", () => {
    const entities = [e("1", "Aragorn")];
    expect(findEntityMatches("aragorn and ARAGORN", entities)).toHaveLength(2);
  });

  it("does not match partial words (word boundary respected)", () => {
    const entities = [e("1", "Ring")];
    expect(findEntityMatches("Ringwraith carries a Ring", entities)).toHaveLength(1);
    expect(findEntityMatches("Ringwraith carries a Ring", entities)[0].start).toBe(21);
  });

  it("matches multiple occurrences of the same entity", () => {
    const entities = [e("1", "Frodo")];
    const matches = findEntityMatches("Frodo and Frodo again", entities);
    expect(matches).toHaveLength(2);
  });

  it("matches multiple different entities in the same text", () => {
    const entities = [e("1", "Frodo"), e("2", "Sam")];
    const matches = findEntityMatches("Frodo and Sam walked", entities);
    expect(matches.map(m => m.entityId).sort()).toEqual(["1", "2"]);
  });

  it("skips entities whose name is shorter than 2 characters", () => {
    const entities = [e("1", "A")];
    expect(findEntityMatches("A short sentence", entities)).toEqual([]);
  });

  it("matches multi-word entity names", () => {
    const entities = [e("1", "The Shire")];
    const matches = findEntityMatches("They returned to The Shire at dawn", entities);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ entityId: "1", start: 17, end: 26 });
  });

  it("prefers longer entity names in returned order (sorted by name length desc)", () => {
    const entities = [e("1", "Ring"), e("2", "One Ring")];
    const matches = findEntityMatches("He held the One Ring", entities);
    const ids = matches.map(m => m.entityId);
    expect(ids).toContain("2");
  });
});
