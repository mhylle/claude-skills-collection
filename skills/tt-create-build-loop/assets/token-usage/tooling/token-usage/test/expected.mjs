// Hand-computed expectations for fixtures/transcripts.
//
// Fixture timeline (session-a main transcript + its subagents, all UTC):
//   2026-09-27 10:00:01  msg_A1  opus      (logged twice: output 5, then 50)        -> unattributed
//              10:01:00  msg_A2  opus      calls setActiveTask(task-1)                -> unattributed (the call takes effect after it)
//              10:02:00  msg_A3  opus      (logged twice, identical usage)            -> task-1
//              10:02:30  msg_X1  haiku     agent-x "Explore" (output 60, then 70)     -> task-1
//              --------  malformed line
//              10:03:00  msg_A4  opus      calls clearActiveTask                      -> task-1
//              10:04:00  msg_A5  claude-mystery-9 (unknown model, unpriced)           -> unattributed
//              10:04:30  msg_X2  haiku     agent-x                                    -> unattributed
//              10:05:00  msg_A6  opus      calls setActiveTask(task-2) -> tool ERROR  -> unattributed
//              10:06:00  msg_A7  opus      (errored set is ignored)                   -> unattributed
//              10:07:00  msg_X3  haiku     agent-x calls setActiveTask(phase-a)       -> unattributed
//              10:08:00  msg_A8  opus      (subagent's set applies session-wide)      -> phase-a
//   2026-09-28 09:00:00  msg_A9  opus      calls setActiveTask(task-2)                -> phase-a
//              09:01:00  msg_A10 opus FAST                                            -> task-2
//              09:02:00  msg_A11 sonnet    legacy usage (no cache_creation object)    -> task-2
//              09:03:00  msg_Y1  sonnet    agent-y (no meta.json -> "subagent")       -> task-2
//   session-b  09:30:00  req_B1  opus      no message.id (requestId fallback; output 35, then 70) -> unattributed
//
// Prices are USD per million tokens, so tokens x price is micro-dollars.
// opus: in 4, out 20, w5m 5, w1h 8, read 0.2 | opus fast: in 8, out 40, w5m 10, w1h 16, read 0.4
// sonnet: 2, 10, 2.5, 4, 0.2 | haiku: 1, 5, 1.25, 2, 0.1

const micro = (n) => n / 1e6;

/** Per-message cost in USD, one line per deduplicated message. */
export const COST = {
  A1: micro(10 * 4 + 50 * 20 + 1000 * 0.2 + 2000 * 8), // 17240
  A2: micro(2 * 4 + 100 * 20 + 3000 * 0.2), // 2608
  A3: micro(3 * 4 + 200 * 20 + 4000 * 0.2 + 1000 * 8), // 12812
  A4: micro(1 * 4 + 20 * 20 + 5000 * 0.2), // 1404
  A5: null, // unknown model
  A6: micro(1 * 4 + 10 * 20), // 204
  A7: micro(1 * 4 + 10 * 20), // 204
  A8: micro(5 * 4 + 30 * 20 + 2000 * 0.2), // 1020
  A9: micro(2 * 4 + 40 * 20 + 6000 * 0.2), // 2008
  A10: micro(100 * 8 + 1000 * 40 + 10000 * 0.4 + 500 * 10), // 49800 (fast)
  A11: micro(20 * 2 + 80 * 10 + 300 * 2.5), // 1590 (legacy cache_creation_input_tokens -> 5m write)
  X1: micro(50 * 1 + 70 * 5 + 100 * 1.25), // 525
  X2: micro(30 * 1 + 20 * 5 + 500 * 0.1), // 180
  X3: micro(10 * 1 + 10 * 5), // 60
  Y1: micro(40 * 2 + 60 * 10 + 1000 * 0.2), // 880
  B1: micro(7 * 4 + 70 * 20 + 700 * 0.2), // 1568
};

export const TOTALS = {
  inputTokens: 286, // 10+2+3+1+4+1+1+5+2+100+20 + 50+30+10 + 40 + 7
  outputTokens: 1810, // 50+100+200+20+40+10+10+30+40+1000+80 + 70+20+10 + 60 + 70
  cacheWrite5mTokens: 900, // 500 (A10) + 300 (A11) + 100 (X1)
  cacheWrite1hTokens: 3000, // 2000 (A1) + 1000 (A3)
  cacheReadTokens: 34200, // 1000+3000+4000+5000+1000+2000+6000+10000 + 500 + 1000 + 700
  totalTokens: 40196, // 286 + 1810 + 900 + 3000 + 34200
  costUsd: micro(92103), // sum of every COST except the unpriced A5
  messages: 16,
  unpricedMessages: 1,
};

export const BY_TASK = {
  "task-1": {
    // A3 + X1 + A4
    inputTokens: 54, // 3 + 50 + 1
    outputTokens: 290, // 200 + 70 + 20
    cacheWrite5mTokens: 100,
    cacheWrite1hTokens: 1000,
    cacheReadTokens: 9000, // 4000 + 0 + 5000
    totalTokens: 10444,
    costUsd: micro(12812 + 525 + 1404), // 14741
    messages: 3,
    firstSeen: "2026-09-27T10:02:00.000Z",
    lastSeen: "2026-09-27T10:03:00.000Z",
    byAgentCost: { main: micro(12812 + 1404), Explore: micro(525) },
    byModelCost: { "claude-opus-5-5": micro(12812 + 1404), "claude-haiku-4-5": micro(525) },
  },
  "phase-a": {
    // A8 + A9
    inputTokens: 7,
    outputTokens: 70,
    cacheWrite5mTokens: 0,
    cacheWrite1hTokens: 0,
    cacheReadTokens: 8000,
    totalTokens: 8077,
    costUsd: micro(1020 + 2008), // 3028
    messages: 2,
    firstSeen: "2026-09-27T10:08:00.000Z",
    lastSeen: "2026-09-28T09:00:00.000Z",
  },
  "task-2": {
    // A10 + A11 + Y1
    inputTokens: 160, // 100 + 20 + 40
    outputTokens: 1140, // 1000 + 80 + 60
    cacheWrite5mTokens: 800, // 500 + 300
    cacheWrite1hTokens: 0,
    cacheReadTokens: 11000, // 10000 + 1000
    totalTokens: 13100,
    costUsd: micro(49800 + 1590 + 880), // 52270
    messages: 3,
    byAgentCost: { main: micro(49800 + 1590), subagent: micro(880) },
  },
};

export const UNATTRIBUTED = {
  // A1 + A2 + A5 + X2 + A6 + A7 + X3 + B1
  inputTokens: 65, // 10 + 2 + 4 + 30 + 1 + 1 + 10 + 7
  outputTokens: 310, // 50 + 100 + 40 + 20 + 10 + 10 + 10 + 70
  cacheWrite5mTokens: 0,
  cacheWrite1hTokens: 2000,
  cacheReadTokens: 6200, // 1000 + 3000 + 1000 + 500 + 700
  totalTokens: 8575,
  costUsd: micro(17240 + 2608 + 180 + 204 + 204 + 60 + 1568), // 22064, A5 unpriced
  messages: 8,
  unpricedMessages: 1,
};

export const BY_DAY = {
  "2026-09-27": {
    // A1..A8 + X1..X3
    messages: 11,
    totalTokens: 20277, // in 117 + out 560 + read 16500 + w5m 100 + w1h 3000
    costUsd: micro(17240 + 2608 + 12812 + 1404 + 204 + 204 + 1020 + 525 + 180 + 60), // 36257
  },
  "2026-09-28": {
    // A9 + A10 + A11 + Y1 + B1
    messages: 5,
    totalTokens: 19919, // in 169 + out 1250 + read 17700 + w5m 800
    costUsd: micro(2008 + 49800 + 1590 + 880 + 1568), // 55846
  },
};

export const BY_MODEL_COST = {
  "claude-opus-5-5": micro(17240 + 2608 + 12812 + 1404 + 204 + 204 + 1020 + 2008 + 49800 + 1568), // 88868
  "claude-sonnet-5-5": micro(1590 + 880), // 2470
  "claude-haiku-4-5": micro(525 + 180 + 60), // 765
};

export const BY_SESSION_COST = {
  "session-a": micro(92103 - 1568), // 90535
  "session-b": micro(1568),
};
