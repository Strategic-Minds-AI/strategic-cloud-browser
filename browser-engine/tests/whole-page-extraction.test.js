import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { extractText, extractHtml } from "../extract-content.js";

test("extract_text without selector reads full body, not Page.innerText", async () => {
  let requested = null;
  const page = {
    locator(sel) {
      requested = sel;
      return { async innerText() { return "Whole page text"; } };
    },
  };
  const text = await extractText(page, undefined, async () => {
    throw new Error("no-selector extraction must not call locate");
  });
  assert.equal(requested, "body");
  assert.equal(text, "Whole page text");
});

test("extract_html without selector returns complete HTML document", async () => {
  const full = "<!doctype html><html><head><title>Demo</title></head><body>Hello</body></html>";
  const page = { async content() { return full; } };
  const result = await extractHtml(page, undefined, async () => {
    throw new Error("no-selector extraction must not call locate");
  });
  assert.equal(result, full);
});

test("empty selector is treated as whole page for both actions", async () => {
  const page = {
    locator(sel) {
      assert.equal(sel, "body");
      return { async innerText() { return "Entire body"; } };
    },
    async content() { return "<html><body>Entire body</body></html>"; },
  };
  assert.equal(await extractText(page, "", async () => { throw new Error("unexpected locate"); }), "Entire body");
  assert.match(await extractHtml(page, "", async () => { throw new Error("unexpected locate"); }), /<html>/);
});

test("explicit text selector preserves caller's CSS or XPath resolution", async () => {
  const page = {};
  const seen = [];
  const locate = async (p, selector) => {
    assert.equal(p, page);
    seen.push(selector);
    return { async innerText() { return "Element text"; } };
  };
  assert.equal(await extractText(page, "//main", locate), "Element text");
  assert.deepEqual(seen, ["//main"]);
});

test("explicit HTML selector preserves existing innerHTML semantics", async () => {
  const page = { async content() { throw new Error("must not extract entire page"); } };
  const seen = [];
  const locate = async (p, selector) => {
    assert.equal(p, page);
    seen.push(selector);
    return { async innerHTML() { return "<em>selected</em>"; } };
  };
  assert.equal(await extractHtml(page, "#card", locate), "<em>selected</em>");
  assert.deepEqual(seen, ["#card"]);
});

test("locator failures propagate and are not masked as successful extraction", async () => {
  const page = {};
  await assert.rejects(extractText(page, "#missing", async () => {
    throw new Error("element not found");
  }), /element not found/);
});

test("engine dispatches both actions through the tested implementation", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const server = readFileSync(path.resolve(here, "../server.js"), "utf8");
  const docker = readFileSync(path.resolve(here, "../Dockerfile"), "utf8");
  assert.match(server, /case "extract_text": \{ result\.data = await extractText\(page, selector, locate\);/);
  assert.match(server, /case "extract_html": \{ result\.data = await extractHtml\(page, selector, locate\);/);
  assert.match(docker, /COPY browser-engine\/extract-content\.js \.\//);
});
