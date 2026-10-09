import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { render, templateFlags, templatePlaceholders } from "../render-template.mjs";

const RENDER = path.join(import.meta.dirname, "..", "render-template.mjs");

const TEMPLATE = [
  "# {{NAME}}",
  "",
  "<!-- if:web -->",
  "Deploys to {{URL}}.",
  "<!-- if:shards -->",
  "Shards: {{SHARD_FILE}}.",
  "<!-- end:shards -->",
  "<!-- end:web -->",
  "<!-- if:!web -->",
  "Nothing is deployed.",
  "<!-- end:!web -->",
  "",
  "Items:",
  "  {{ITEMS}}",
  "Done.",
].join("\n");

test("includes a block whose flag is on and drops one whose flag is off, nested blocks included", () => {
  const on = render(TEMPLATE, { flags: { web: true, shards: false }, values: { NAME: "Shop", URL: "https://shop.test/", ITEMS: "- a" } });
  assert.match(on, /Deploys to https:\/\/shop\.test\/\./);
  assert.doesNotMatch(on, /Shards:/);
  assert.doesNotMatch(on, /Nothing is deployed/);

  const off = render(TEMPLATE, { flags: { web: false, shards: true }, values: { NAME: "Shop", ITEMS: "- a" } });
  assert.doesNotMatch(off, /Deploys|Shards/, "a nested block never survives its excluded parent");
  assert.match(off, /Nothing is deployed\./);
});

test("removes every block marker, so no '<!-- if:' or '<!-- end:' reaches the output", () => {
  const out = render(TEMPLATE, { flags: { web: true, shards: true }, values: { NAME: "Shop", URL: "u", SHARD_FILE: "s.json", ITEMS: "- a" } });
  assert.doesNotMatch(out, /<!-- (if|end):/);
});

test("a multi-line value alone on an indented line keeps that indentation on every line", () => {
  const out = render(TEMPLATE, { flags: { web: false, shards: false }, values: { NAME: "Shop", ITEMS: "- one\n- two" } });
  assert.match(out, /Items:\n {2}- one\n {2}- two\nDone\./);
});

test("in markdown, an empty value alone on its line takes the line with it", () => {
  assert.equal(render("**List:**\n{{EXTRA}}\n- core", { flags: {}, values: { EXTRA: "" } }), "**List:**\n- core\n");
});

test("an inline value is inserted literally, without re-reading it as a template", () => {
  const out = render("Say {{A}}.", { flags: {}, values: { A: "$& and $1" } });
  assert.equal(out, "Say $& and $1.\n");
});

test("collapses the blank lines a dropped block leaves behind", () => {
  const out = render("a\n\n<!-- if:x -->\nb\n<!-- end:x -->\n\nc", { flags: { x: false }, values: {} });
  assert.equal(out, "a\n\nc\n");
});

test("refuses a placeholder that survives into the output without a value", () => {
  assert.throws(() => render(TEMPLATE, { flags: { web: true, shards: false }, values: { NAME: "Shop", ITEMS: "- a" } }), /URL/);
});

test("a placeholder only used inside a dropped block needs no value", () => {
  assert.doesNotThrow(() => render(TEMPLATE, { flags: { web: false, shards: false }, values: { NAME: "Shop", ITEMS: "- a" } }));
});

test("every flag the template uses must be decided explicitly, and unknown flags or values are typos", () => {
  assert.throws(() => render(TEMPLATE, { flags: { web: false }, values: { NAME: "Shop", ITEMS: "- a" } }), /shards/);
  assert.throws(() => render(TEMPLATE, { flags: { web: false, shards: false, webb: true }, values: { NAME: "Shop", ITEMS: "- a" } }), /webb/);
  assert.throws(() => render(TEMPLATE, { flags: { web: false, shards: false }, values: { NAME: "Shop", ITEMS: "- a", NAEM: "x" } }), /NAEM/);
  assert.throws(() => render(TEMPLATE, { flags: { web: "yes", shards: false }, values: { NAME: "Shop", ITEMS: "- a" } }), /boolean/);
});

test("refuses unbalanced or crossed blocks", () => {
  assert.throws(() => render("<!-- if:a -->\nx", { flags: { a: true }, values: {} }), /unclosed/);
  assert.throws(() => render("x\n<!-- end:a -->", { flags: { a: true }, values: {} }), /without/);
  assert.throws(() => render("<!-- if:a -->\n<!-- if:b -->\n<!-- end:a -->\n<!-- end:b -->", { flags: { a: true, b: true }, values: {} }), /end:a/);
});

test("an inline block keeps or drops text within its line, and the flag may be negated", () => {
  const template = "commit<!-- if:remote --> and push<!-- end:remote --><!-- if:!remote --> locally<!-- end:!remote -->.";
  assert.equal(render(template, { flags: { remote: true }, values: {} }), "commit and push.\n");
  assert.equal(render(template, { flags: { remote: false }, values: {} }), "commit locally.\n");
});

test("inline blocks inside a dropped line block vanish with it, and their placeholders need no value", () => {
  const template = "<!-- if:ci -->\nCI<!-- if:deployed -->, then {{URL}}<!-- end:deployed -->.\n<!-- end:ci -->\nend";
  assert.equal(render(template, { flags: { ci: false, deployed: true }, values: {} }), "end\n");
  assert.throws(() => render(template, { flags: { ci: true, deployed: true }, values: {} }), /URL/);
});

test("refuses an inline block left open on its line", () => {
  assert.throws(() => render("a<!-- if:x --> b", { flags: { x: true }, values: {} }), /line 1/);
  assert.throws(() => render("a<!-- if:x --> b<!-- end:y -->", { flags: { x: true, y: true }, values: {} }), /line 1/);
});

test("refuses a value that would leave a placeholder behind", () => {
  assert.throws(() => render("{{A}}", { flags: {}, values: { A: "see {{B}}" } }), /B/);
});

test("lists a template's flags and placeholders", () => {
  assert.deepEqual(templateFlags(TEMPLATE), ["shards", "web"]);
  assert.deepEqual(templatePlaceholders(TEMPLATE), ["ITEMS", "NAME", "SHARD_FILE", "URL"]);
});

test("refuses a malformed marker or placeholder instead of passing it through as text", () => {
  for (const template of ["<!--if:x-->\na\n<!--end:x-->", "<!-- if:x  -->\na\n<!-- end:x -->", "say {{ NAME }}", "say {{name}}"]) {
    assert.throws(() => render(template, { flags: { x: true }, values: { NAME: "n" } }), /malformed/, template);
  }
});

test("an inline block left open is refused even inside a dropped line block", () => {
  assert.throws(() => render("<!-- if:a -->\nx<!-- if:b --> y\n<!-- end:a -->", { flags: { a: false, b: true }, values: {} }), /line 2/);
});

test("in a non-markdown template, values and blank lines are kept exactly as given", () => {
  const template = "run() {\n  {{CMD}}\n}\n\n\nend";
  const value = "cat <<'EOF'\nliteral\n\n\nEOF";
  assert.equal(render(template, { flags: {}, values: { CMD: value } }, { markdown: false }), `run() {\n  ${value}\n}\n\n\nend\n`);
});

test("CLI: renders to stdout, or to --out, and --flags all-on / all-off override every flag", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "render-template-"));
  const tpl = path.join(dir, "t.md");
  const values = path.join(dir, "v.json");
  fs.writeFileSync(tpl, TEMPLATE);
  fs.writeFileSync(values, JSON.stringify({ flags: { web: false, shards: false }, values: { NAME: "Shop", URL: "u", SHARD_FILE: "s", ITEMS: "- a" } }));

  const plain = spawnSync(process.execPath, [RENDER, "--template", tpl, "--values", values, "--registry", "none"], { encoding: "utf8" });
  assert.equal(plain.status, 0, plain.stderr);
  assert.match(plain.stdout, /Nothing is deployed/);

  const allOn = spawnSync(process.execPath, [RENDER, "--template", tpl, "--values", values, "--flags", "all-on", "--registry", "none"], { encoding: "utf8" });
  assert.match(allOn.stdout, /Shards: s\./);
  assert.doesNotMatch(allOn.stdout, /Nothing is deployed/);

  const out = path.join(dir, "out.md");
  const written = spawnSync(process.execPath, [RENDER, "--template", tpl, "--values", values, "--flags", "all-off", "--out", out, "--registry", "none"], { encoding: "utf8" });
  assert.equal(written.status, 0, written.stderr);
  assert.equal(written.stdout, "");
  assert.match(fs.readFileSync(out, "utf8"), /Nothing is deployed/);
});

test("CLI: a name the placeholder registry does not document is a typo, even when the template does not use it", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "render-template-"));
  const tpl = path.join(dir, "t.md");
  const registry = path.join(dir, "placeholders.md");
  fs.writeFileSync(tpl, "{{NAME}}<!-- if:web --> web<!-- end:web -->");
  fs.writeFileSync(registry, "| `{{NAME}}` | x |\n| `{{OTHER}}` | used by another template |\n| `web` | x |\n");
  const run = (input) => {
    const values = path.join(dir, `v${Math.random()}.json`);
    fs.writeFileSync(values, JSON.stringify(input));
    return spawnSync(process.execPath, [RENDER, "--template", tpl, "--values", values, "--registry", registry], { encoding: "utf8" });
  };
  assert.equal(run({ flags: { web: true }, values: { NAME: "n", OTHER: "o" } }).status, 0, "another template's documented names are fine");
  const typoValue = run({ flags: { web: true }, values: { NAME: "n", NAEM: "x" } });
  assert.equal(typoValue.status, 1);
  assert.match(typoValue.stderr, /NAEM/);
  const typoFlag = run({ flags: { web: true, wbe: false }, values: { NAME: "n" } });
  assert.equal(typoFlag.status, 1);
  assert.match(typoFlag.stderr, /wbe/);
});

/** Windows makes symlinks only with Developer Mode or admin rights; without them the symlink case is skipped, not failed. */
function symlinkRefused() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "symlink-probe-"));
  try {
    fs.symlinkSync(RENDER, path.join(dir, "probe.mjs"));
    return false;
  } catch (error) {
    return process.platform === "win32" && error.code === "EPERM" ? "Windows refuses to make symlinks here (no Developer Mode or admin rights)" : false;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("CLI: runs the same through a symlink", { skip: symlinkRefused() }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "render-template-"));
  const link = path.join(dir, "linked.mjs");
  fs.symlinkSync(RENDER, link);
  const result = spawnSync(process.execPath, [link, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage/);
});

test("CLI: a refused render exits 1 with the reason and writes nothing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "render-template-"));
  const tpl = path.join(dir, "t.md");
  const values = path.join(dir, "v.json");
  const out = path.join(dir, "out.md");
  fs.writeFileSync(tpl, "{{MISSING}}");
  fs.writeFileSync(values, JSON.stringify({ flags: {}, values: {} }));
  const result = spawnSync(process.execPath, [RENDER, "--template", tpl, "--values", values, "--out", out, "--registry", "none"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /MISSING/);
  assert.equal(fs.existsSync(out), false);
});
