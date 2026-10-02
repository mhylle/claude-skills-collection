const LABEL_MIN_WIDTH = 14;

/**
 * Renders a report as a plain-text summary for the terminal.
 * @param {object} report output of buildReport
 * @returns {string}
 */
export function formatReport(report) {
  const t = report.totals;
  const lines = [
    `Token usage (${report.note})`,
    `Pricing: ${report.pricing.source} (updated ${report.pricing.updated})`,
    `Generated: ${report.generatedAt}`,
    `Messages counted: ${report.messagesCounted} | malformed lines: ${report.malformedLines} | unpriced messages: ${t.unpricedMessages}`,
    "",
    `Totals: ${formatInt(t.totalTokens)} tokens, ${formatUsd(t.costUsd)}`,
    `  input ${formatInt(t.inputTokens)} | output ${formatInt(t.outputTokens)} | cache write 5m ${formatInt(t.cacheWrite5mTokens)} | cache write 1h ${formatInt(t.cacheWrite1hTokens)} | cache read ${formatInt(t.cacheReadTokens)}`,
    ...section("By task (highest cost first)", byCostDesc({ ...report.byTask, unattributed: report.unattributed })),
    ...(report.byPhase ? section("By phase", byCostDesc(report.byPhase), (key, b) => b.phaseTitle ?? "") : []),
    ...(report.byRelease ? section("By release", byCostDesc(report.byRelease)) : []),
    ...section("By day (UTC)", Object.entries(report.byDay)),
    ...section("By model", byCostDesc(report.byModel)),
    ...section("By session", byCostDesc(report.bySession)),
    "",
    `Unknown models (not priced): ${report.unknownModels.length > 0 ? report.unknownModels.join(", ") : "none"}`,
  ];
  return lines.join("\n") + "\n";
}

function section(title, entries, suffix = () => "") {
  if (entries.length === 0) return ["", title, "  (none)"];
  const width = Math.max(LABEL_MIN_WIDTH, ...entries.map(([key]) => key.length));
  return [
    "",
    title,
    ...entries.map(([key, bucket]) =>
      [
        `  ${key.padEnd(width)}`,
        formatUsd(bucket.costUsd).padStart(10),
        `${formatInt(bucket.totalTokens).padStart(14)} tokens`,
        `${String(bucket.messages).padStart(6)} msgs`,
        suffix(key, bucket),
      ]
        .join("  ")
        .trimEnd(),
    ),
  ];
}

function byCostDesc(buckets) {
  return Object.entries(buckets).sort(([, a], [, b]) => (b.costUsd ?? -1) - (a.costUsd ?? -1));
}

function formatInt(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatUsd(value) {
  if (value === null) return "n/a";
  return `$${value >= 1 ? value.toFixed(2) : value.toFixed(4)}`;
}
