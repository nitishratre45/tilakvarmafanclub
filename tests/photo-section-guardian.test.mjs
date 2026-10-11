import test from "node:test";
import assert from "node:assert/strict";
import { inspectMedia, repairExactUrlDuplicates } from "../scripts/photo-section-guardian.mjs";

test("same caption with different URLs keeps both photos", () => {
  const data = { items: [
    { title: "Tilak Varma", url: "https://example.com/a.jpg" },
    { title: "Tilak Varma", url: "https://example.com/b.jpg" },
  ] };
  const repaired = repairExactUrlDuplicates(data);
  assert.equal(repaired.removed, 0);
  assert.equal(repaired.data.items.length, 2);
});

test("only an identical photo URL is deduplicated", () => {
  const data = { items: [
    { title: "A", url: "https://example.com/a.jpg" },
    { title: "Different caption", url: "https://example.com/a.jpg" },
  ] };
  const repaired = repairExactUrlDuplicates(data);
  assert.equal(repaired.removed, 1);
  assert.equal(repaired.data.items.length, 1);
});

test("invalid URL is reported, not silently deleted", () => {
  const report = inspectMedia({ items: [{ title: "Photo", url: "javascript:alert(1)" }] });
  assert.equal(report.errors.length, 1);
});

test("missing repository photo is warned about, not deleted", () => {
  const url = "/assets/imported-photos/" + "a".repeat(64) + ".webp";
  const data = { items: [{ title: "BCCI", url }] };
  const report = inspectMedia(data, () => false);
  assert.equal(report.missingLocalFiles.length, 1);
  assert.equal(repairExactUrlDuplicates(data).data.items.length, 1);
});
