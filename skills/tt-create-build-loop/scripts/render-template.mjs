#!/usr/bin/env node
// Renders a tt-create-build-loop template from a values file (run with --help).
//
// Template syntax:
//   {{NAME}}                  replaced by values.NAME
//   <!-- if:flag -->          on a line of its own, starts a block kept when flags.flag is true;
//   <!-- end:flag -->         `if:!flag` keeps it when the flag is false. Blocks nest; each end
//                             names its flag.
//   x<!-- if:flag -->y<!-- end:flag -->z
//                             an inline block, kept or dropped within its line; no nesting.
//
// Markdown templates (.md) are also tidied: a value alone on an indented line is indented on each
// of its lines, and the blank lines a dropped block leaves are collapsed. Any other template (a
// shell script) gets its values verbatim and its blank lines untouched.
//
// It fails closed: every flag the template uses must be decided (true/false), unknown or malformed
// names are typos, and a placeholder left in the output, or a value that would leave one, is an
// error. Nothing is written when it fails.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLACEHOLDER = /\{\{([A-Z0-9_]+)\}\}/g;
const OPEN = /^\s*<!-- if:(!?)([a-z0-9-]+) -->\s*$/;
const CLOSE = /^\s*<!-- end:(!?[a-z0-9-]+) -->\s*$/;
const ALONE = /^(\s*)\{\{([A-Z0-9_]+)\}\}\s*$/;
const MARKER = /<!-- (?:if|end):!?([a-z0-9-]+) -->/g;
const INLINE = /<!-- if:(!?)([a-z0-9-]+) -->(.*?)<!-- end:\1\2 -->/g;
/** Anything shaped like a marker or a placeholder; what the strict forms above don't match is malformed. */
const LOOSE_MARKER = /<!--\s*(?:if|end)\s*:[^>]*-->/g;
const LOOSE_PLACEHOLDER = /\{\{[^{}]*\}\}/g;
const DEFAULT_REGISTRY = path.resolve(import.meta.dirname, "..", "references", "placeholders.md");

export const USAGE = `Usage: node render-template.mjs --template <file> --values <json> [--flags as-given|all-on|all-off] [--out <file>] [--registry <md>]

  --values    {"flags": {"<flag>": true|false, ...}, "values": {"<NAME>": "<text>", ...}}
  --flags     all-on / all-off override every flag (to check that each combination renders)
  --out       write here instead of stdout
  --registry  the placeholder documentation; a value or flag it doesn't document is a typo
              (default: ../references/placeholders.md, when it exists; "none" skips the check)
`;

/**
 * Flags a template's optional blocks use, sorted.
 * @param {string} template
 * @returns {string[]}
 */
export function templateFlags(template) {
  return [...new Set([...template.matchAll(MARKER)].map((match) => match[1]))].sort();
}

/**
 * Placeholders a template uses anywhere, sorted.
 * @param {string} template
 * @returns {string[]}
 */
export function templatePlaceholders(template) {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map((match) => match[1]))].sort();
}

/**
 * Names a placeholder registry documents: its `{{NAME}}` rows and its `flag` rows.
 * @param {string} markdown placeholders.md
 * @returns {{values: Set<string>, flags: Set<string>}}
 */
export function registryNames(markdown) {
  return {
    values: new Set([...markdown.matchAll(/^\| `\{\{([A-Z0-9_]+)\}\}`/gm)].map((match) => match[1])),
    flags: new Set([...markdown.matchAll(/^\| `([a-z0-9-]+)` \|/gm)].map((match) => match[1])),
  };
}

/**
 * Renders a template.
 * @param {string} template
 * @param {{flags: Record<string, boolean>, values: Record<string, string>}} input
 * @param {{markdown?: boolean}} [options] markdown (the default) tidies indentation and blank lines
 * @returns {string} the rendered text, ending in one newline
 * @throws on malformed markers or placeholders, undecided, unknown or non-boolean flags, unknown or
 *   missing values, and bad blocks
 */
export function render(template, { flags = {}, values = {} }, { markdown = true } = {}) {
  checkSyntax(template);
  checkFlags(template, flags);
  checkValues(template, values);
  const kept = keepBlocks(template.split("\n"), flags);
  const out = kept.flatMap((line) => substitute(line, values, markdown));
  const leftover = [...new Set(out.join("\n").match(PLACEHOLDER) ?? [])];
  if (leftover.length > 0) throw new Error(`no value for ${leftover.join(", ")}`);
  if (!markdown) return out.join("\n").replace(/\n*$/, "\n");
  return collapseBlankLines(out).join("\n").trim() + "\n";
}

/** Every line, kept or not: markers and placeholders well-formed, inline blocks closed on their line. */
function checkSyntax(template) {
  template.split("\n").forEach((line, index) => {
    const where = `line ${index + 1}`;
    if ((line.match(LOOSE_MARKER) ?? []).length !== (line.match(MARKER) ?? []).length) throw new Error(`${where}: malformed block marker: ${line.trim()}`);
    if ((line.match(LOOSE_PLACEHOLDER) ?? []).length !== (line.match(PLACEHOLDER) ?? []).length) throw new Error(`${where}: malformed placeholder: ${line.trim()}`);
    if (!OPEN.test(line) && !CLOSE.test(line) && line.replace(INLINE, "").match(MARKER)) {
      throw new Error(`${where}: an inline block must open and close on the same line`);
    }
  });
}

function checkFlags(template, flags) {
  const used = templateFlags(template);
  const unknown = Object.keys(flags).filter((flag) => !used.includes(flag));
  if (unknown.length > 0) throw new Error(`unknown flag(s): ${unknown.join(", ")} (the template uses: ${used.join(", ") || "none"})`);
  const undecided = used.filter((flag) => !(flag in flags));
  if (undecided.length > 0) throw new Error(`undecided flag(s): ${undecided.join(", ")}`);
  const notBoolean = used.filter((flag) => typeof flags[flag] !== "boolean");
  if (notBoolean.length > 0) throw new Error(`flag(s) must be boolean: ${notBoolean.join(", ")}`);
}

function checkValues(template, values) {
  const used = templatePlaceholders(template);
  const unknown = Object.keys(values).filter((name) => !used.includes(name));
  if (unknown.length > 0) throw new Error(`unknown value(s): ${unknown.join(", ")}`);
  for (const [name, value] of Object.entries(values)) {
    if (typeof value !== "string") throw new Error(`value ${name} must be a string`);
    const nested = value.match(PLACEHOLDER);
    if (nested) throw new Error(`value ${name} contains ${nested.join(", ")}`);
  }
}

/** Drops excluded blocks and every marker line, and resolves inline blocks; a stack checks that blocks close in order. */
function keepBlocks(lines, flags) {
  const stack = [];
  const kept = [];
  lines.forEach((line, index) => {
    const open = line.match(OPEN);
    const close = line.match(CLOSE);
    if (open) {
      const [, negated, flag] = open;
      const parentKept = stack.every((block) => block.keep);
      stack.push({ name: negated + flag, keep: parentKept && flags[flag] === !negated });
    } else if (close) {
      const top = stack.pop();
      if (!top) throw new Error(`line ${index + 1}: <!-- end:${close[1]} --> without an open block`);
      if (top.name !== close[1]) throw new Error(`line ${index + 1}: <!-- end:${close[1]} --> closes <!-- if:${top.name} -->`);
    } else if (stack.every((block) => block.keep)) {
      kept.push(line.replace(INLINE, (match, negated, flag, text) => (flags[flag] === !negated ? text : "")));
    }
  });
  if (stack.length > 0) throw new Error(`unclosed block(s): ${stack.map((block) => block.name).join(", ")}`);
  return kept;
}

/** A line with its placeholders replaced; in markdown, a lone placeholder spreads its value over indented lines, or takes the line away when empty. */
function substitute(line, values, markdown) {
  const alone = markdown ? line.match(ALONE) : null;
  if (alone && alone[2] in values) {
    const [, indent, name] = alone;
    if (values[name] === "") return [];
    return values[name].split("\n").map((valueLine) => (valueLine === "" ? "" : indent + valueLine));
  }
  return [line.replace(PLACEHOLDER, (match, name) => (name in values ? values[name] : match))];
}

function collapseBlankLines(lines) {
  return lines.filter((line, index) => line.trim() !== "" || index === 0 || lines[index - 1].trim() !== "");
}

function parseArgs(argv) {
  const options = { template: null, values: null, flags: "as-given", out: null, registry: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (["--template", "--values", "--flags", "--out", "--registry"].includes(arg)) {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      options[arg.slice(2)] = value;
      i += 1;
    } else throw new Error(`unknown option ${arg}`);
  }
  if (!options.help && (!options.template || !options.values)) throw new Error("--template and --values are required");
  if (!["as-given", "all-on", "all-off"].includes(options.flags)) throw new Error(`--flags must be as-given, all-on or all-off`);
  return options;
}

/** Names in a values file that the registry doesn't document. */
function undocumented(input, registryPath) {
  const { values, flags } = registryNames(fs.readFileSync(registryPath, "utf8"));
  return [
    ...Object.keys(input.values ?? {}).filter((name) => !values.has(name)).map((name) => `value ${name}`),
    ...Object.keys(input.flags ?? {}).filter((flag) => !flags.has(flag)).map((flag) => `flag ${flag}`),
  ];
}

function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }
  const template = fs.readFileSync(options.template, "utf8");
  const input = JSON.parse(fs.readFileSync(options.values, "utf8"));
  const registryPath = options.registry === "none" ? null : (options.registry ?? (fs.existsSync(DEFAULT_REGISTRY) ? DEFAULT_REGISTRY : null));
  if (registryPath) {
    const typos = undocumented(input, registryPath);
    if (typos.length > 0) throw new Error(`not documented in ${registryPath}, so probably typos: ${typos.join(", ")}`);
  }
  // One values file serves every template; the registry vouches for names only another one uses.
  const given = input.flags ?? {};
  const flags = Object.fromEntries(
    templateFlags(template)
      .filter((flag) => options.flags !== "as-given" || flag in given)
      .map((flag) => [flag, options.flags === "as-given" ? given[flag] : options.flags === "all-on"]),
  );
  const used = templatePlaceholders(template);
  const values = Object.fromEntries(Object.entries(input.values ?? {}).filter(([name]) => used.includes(name)));
  const text = render(template, { flags, values }, { markdown: options.template.endsWith(".md") });
  if (options.out) {
    fs.mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true });
    fs.writeFileSync(options.out, text);
  } else {
    process.stdout.write(text);
  }
}

/** True when this file is the program being run, however it was reached (through a symlink, say). */
function isMain() {
  try {
    return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`render-template: ${error.message}\n`);
    process.exitCode = 1;
  }
}
