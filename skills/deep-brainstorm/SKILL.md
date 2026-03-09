---
name: deep-brainstorm
description: Multi-session, resumable deep brainstorming with mindmap-on-disk structure. Explores ideas across multiple dimensions using creative methodologies (Morphological Analysis, TRIZ, Lateral Thinking, Lotus Blossom, Assumption Mapping). Sessions persist to filesystem and can span days. Triggers on "deep brainstorm", "deep dive brainstorm", "multi-session brainstorm", "brainstorm deeply", or when the user wants extended, resumable idea exploration. Higher depth than brainstorm or team-brainstorm but spread across sessions.
context: fork
---

# Deep Brainstorm

## Overview

This skill provides **multi-session, resumable deep brainstorming** that persists state to a mindmap-like directory structure on disk. Unlike `brainstorm` (single session, one output file) or `team-brainstorm` (single session, agent teams, one output file), deep-brainstorm spreads exploration across multiple sessions, building a rich interconnected knowledge structure over time.

**Comparison**:

| Aspect | `brainstorm` | `team-brainstorm` | `deep-brainstorm` |
|--------|-------------|-------------------|-------------------|
| Sessions | 1 | 1 | Multiple (resumable) |
| Output | Single `.md` file | Single `.md` file | Directory tree |
| Methodologies | Socratic, Six Hats, SCAMPER, Premortem | Adversarial debate | All of the above + Morphological, TRIZ, Lateral Thinking, Lotus Blossom, Assumption Mapping, Reverse Brainstorming, HMW |
| Token cost | ~8-12K | ~25-40K | ~8-15K per session |
| Best for | Quick exploration | Critical decisions | Complex, multi-faceted topics |
| State | None | None | `_mindmap.yaml` on disk |

## Critical Rules (READ FIRST)

These rules override any instinct to "be helpful by completing things quickly." This skill is intentionally slow and interactive.

### Rule 1: NEVER Solve During SEED

The SEED phase maps the LANDSCAPE of areas to explore. It does NOT:
- Pick technologies or frameworks
- Recommend architectures
- Make decisions
- Produce any "answer" to the user's problem

**SEED output is a set of QUESTIONS organized into areas, not answers.**

### Rule 2: NO Research During SEED

Do NOT spawn web-search-researcher or any research subagents during the SEED phase. Research happens in EXPLORE sessions, scoped to one area at a time. Researching everything up front kills the exploratory process by anchoring on early findings.

### Rule 3: Minimum 3 Rounds of Socratic Questions

Before moving to area identification, you MUST complete at least 3 rounds of Socratic questioning with the user (2-4 questions per round). After each round, WAIT for the user to respond before asking more. Do NOT batch all questions into one message.

If the user says "let's go" or "skip questions" before 3 rounds, you may proceed, but not before explicitly noting: "We're skipping ahead — we can always come back to deepen our understanding in later sessions."

### Rule 4: Every Step Requires User Input

Never proceed through multiple SEED steps without user responses in between. The flow is:
1. Idea Capture → present back → **wait for user confirmation**
2. Socratic Round 1 → **wait for answers**
3. Socratic Round 2 → **wait for answers**
4. Socratic Round 3+ → **wait for answers** or user says "enough"
5. Present proposed areas → **wait for user to validate/modify**
6. Scaffold directories → **wait for user acknowledgment**
7. Harvest and end session

Launching agents in the background while "waiting" for results is NOT interaction.

### Rule 5: SEED Is One Session, Then STOP

After SEED scaffold is created and harvest is done, END THE SESSION. Do not continue into EXPLORE. Say:
```
SEED complete. {N} areas mapped. Resume with /deep-brainstorm when you're ready
to explore the first area.
```

The user must invoke `/deep-brainstorm` again to start an EXPLORE session.

### Rule 6: Use the Mindmap Directory Structure

All output goes to `docs/brainstorms/deep/{topic-slug}/` using the exact structure from `references/mindmap-schema.md`. NEVER write flat files to `docs/brainstorm/` or any other location. The `_mindmap.yaml` file MUST exist and be valid YAML.

### Rule 7: This Is Collaborative, Not Autonomous

The user should be talking more than you in each session. Your role is to:
- Ask provocative questions
- Apply creative methodologies as structured frameworks
- Capture and organize the user's thinking
- Challenge assumptions
- Surface connections the user hasn't seen

Your role is NOT to:
- Research and present a comprehensive analysis
- Make recommendations
- Produce deliverables the user didn't generate with you
- Run agents autonomously while the user waits

---

## Initial Response

When this skill is invoked, **first check for existing sessions**:

### Resume Detection Protocol

1. Check if `docs/brainstorms/deep/` exists and contains subdirectories
2. If existing sessions found:
   ```
   I found existing deep brainstorm sessions:
   - {topic-1} (last session: YYYY-MM-DD, phase: {phase}, {N} sessions)
   - {topic-2} (last session: YYYY-MM-DD, phase: {phase}, {N} sessions)

   Want to resume one of these, or start a new deep brainstorm?
   ```
3. If resuming: Read `_mindmap.yaml` from the selected session and run the **Warm-Up Recap** protocol (see `references/session-protocols.md`)
4. If starting new, or no existing sessions found, check for **conversation context** (see below)

### Conversation Context Detection

**IMPORTANT**: This skill uses `context: fork`, which means you have the FULL conversation history — every message the user sent, every analysis you performed, every branch/gap identified. Before asking the user to "share your idea," you MUST scan the conversation for ALL of the following:

1. **The idea itself**: Has the user already described a concept, problem, or project?
2. **Prior analysis**: Was there a brainstorm, branch analysis, gap analysis, or any structured exploration already done in-conversation?
3. **Identified branches/gaps**: Did the conversation identify specific areas, branches, dimensions, gaps, or unexplored threads? These are gold — they may be the REASON the user is invoking deep-brainstorm.
4. **Files on disk**: Were brainstorm documents, analysis files, or notes written to the filesystem during the conversation?
5. **The user's last message before invoking the skill**: What were they talking about? What was the immediate context? This often reveals WHY they want a deep brainstorm.

**Scan the conversation thoroughly.** Do not just check files on disk. The most valuable context is often in the conversational analysis — tables of branches, lists of gaps, observations about what was missed — that was never written to a file.

---

**If the conversation contains prior branch/gap analysis** (highest priority — this is the most common entry point):

The user likely invoked deep-brainstorm BECAUSE the conversation identified areas that need deeper exploration. Acknowledge ALL of it:

```
I can see we've already done significant analysis on {topic}. Let me build on that
rather than start from scratch.

Here's what the conversation has established:

**Core concept**: {summarize}

**Branches already identified** (from our earlier analysis):
{List ALL branches/areas identified in-conversation, with coverage status}

**Key gaps flagged for deeper exploration**:
- {Gap 1}: {why it matters}
- {Gap 2}: {why it matters}

**Decisions/conclusions already reached**:
- {Decision 1}
- {Decision 2}

I'd like to use these branches as the starting point for the deep brainstorm
area map. We can refine them during Socratic rounds.

Which gaps are most important to you? And are there branches I should add or
drop from this list?
```

Then use the identified branches as the basis for Step 3 (Area Identification), skipping Steps 1-2 only if the conversation already covered clarification thoroughly. If not, run targeted Socratic rounds focused on the GAPS, not re-asking what's already been answered.

---

**If the conversation contains a described idea but NO branch analysis**:
```
I can see we've already been discussing {topic}. I'll use what's in our conversation
as the starting point for a deep brainstorm.

Let me summarize what I understand so far, then we'll do Socratic rounds to deepen
it before mapping out exploration areas.

{Summarize the idea as understood from conversation context}

Does this capture the core of what you want to explore deeply?
```

Then proceed to **Step 1: Idea Capture** using conversation context, followed by Socratic Clarification. Do NOT ask the user to re-explain what they already told you.

---

**If the conversation has NO prior context about an idea**:
```
I'll guide you through a deep brainstorm - a multi-session exploration that builds a
rich knowledge structure on disk. We'll start by capturing your idea and mapping out
the key areas to explore. Each session we'll go deeper into specific areas using
targeted creative methodologies.

Share your idea, and we'll begin the SEED phase.
```

## Workflow: 5-Phase System

### Phase 1: SEED (First Session)

**Goal**: Capture the central idea, identify 5-8 exploration areas, scaffold the directory structure.

#### Step 1: Idea Capture

Parse the user's idea and identify:

| Element | Description |
|---------|-------------|
| **Core Concept** | The fundamental idea or challenge |
| **Stated Goals** | What the user wants to achieve |
| **Implied Constraints** | Limitations mentioned or implied |
| **Domain** | The field or context this lives in |

#### Step 2: Socratic Clarification (MINIMUM 3 ROUNDS)

Use questions from `references/questioning-frameworks.md` to deepen understanding.

**Round structure**: Ask 2-4 questions per round. STOP and WAIT for the user's response before proceeding to the next round. Do not ask all questions at once.

**Round 1** - Clarification & Scope:
- What do you mean by [key terms]?
- What boundaries should this have? What's explicitly out of scope?
- What does success look like? How would you know this worked?

**Round 2** - Assumptions & Constraints:
- What are we taking for granted here?
- What must be true for this to work?
- What resources, skills, or conditions are we assuming exist?

**Round 3** - Perspective & Motivation:
- Who else is affected by this? How would they view it?
- What excites you most about this? What worries you?
- What's the opposite approach, and why aren't we doing that?

**After each round**, offer:
> "I have more questions to dig deeper, or we can start mapping exploration areas. Your call."

**After Round 3+**, when the user signals readiness, move to Step 3.

**GATE: Do NOT proceed to Step 3 until the user has responded to at least 3 rounds of questions, or explicitly asked to skip ahead.**

#### Step 3: Area Identification (REQUIRES USER VALIDATION)

Using the clarified concept, identify 5-8 distinct areas (branches) for exploration.

**Branch Discovery Methods** (use a combination):
- **Decomposition**: What are the natural components of this idea?
- **Stakeholder mapping**: Who is affected? Each stakeholder perspective may be a branch
- **Dimension analysis**: Technical, business, user experience, operational, strategic, creative
- **HMW generation**: Generate How Might We questions (see `references/creative-methodologies.md`), then cluster into areas
- **Gap analysis**: What's NOT in the user's description that a real implementation needs? (operational concerns, scaling, failure modes, adjacent problems)
- **Source material mining**: If the user provided reference material, extract EVERY distinct thread — even ones that seem minor. Minor threads often become the most interesting exploration areas.

**IMPORTANT**: Areas are QUESTIONS to explore, not answers. Each area should be framed as "What about {X}?" not "We should use {X}."

**Coverage table**: Present a coverage analysis showing what the user's input explicitly addressed vs. what's implicit or missing. This surfaces blind spots:

```
Based on our discussion, here are the branches I see:

BRANCHES FROM YOUR DESCRIPTION (what you mentioned):
1. **{Area Name}** - {What to explore, framed as questions}
   Key questions: HMW {question}? What if {question}?
   Suggested methodology: {methodology}

2. ...

BRANCHES NOT IN YOUR DESCRIPTION (important gaps):
3. **{Area Name}** - {Why this matters even though you didn't mention it}
   Key questions: HMW {question}? What if {question}?
   Suggested methodology: {methodology}

4. ...

That's {N} areas total. Does this landscape feel right?
Want to add, remove, rename, or merge any areas?
I won't create the directory structure until you confirm.
```

This coverage table format helps the user see what they covered vs. what they missed, which is one of the most valuable outputs of the SEED phase.

**GATE: Do NOT proceed to Step 4 until the user has confirmed or modified the area list.**

#### Step 4: Scaffold Directory Structure

Once areas are confirmed, create the full directory structure:

```
docs/brainstorms/deep/{topic-slug}/
├── _index.md
├── _mindmap.yaml
├── _parking-lot.md
├── _decisions.md
├── _connections.md
├── areas/
│   ├── {area-1-slug}/
│   │   ├── _overview.md
│   │   ├── analysis.md
│   │   └── ideas.md
│   ├── {area-2-slug}/
│   │   ├── _overview.md
│   │   ├── analysis.md
│   │   └── ideas.md
│   └── ... (for each area)
└── sessions/
    └── session-001.md
```

Write initial content to all files using templates from `references/mindmap-schema.md`. Every file should have meaningful stub content, not empty files.

#### Step 5: Harvest (THEN STOP)

Run the **Harvest Ritual** (see `references/session-protocols.md`):
- Write session-001.md with what was discussed and decided
- Update _index.md with executive summary (what we know so far, NOT solutions)
- Write _mindmap.yaml with all areas at `unexplored` status
- Suggest which area to explore first and why

**End the session. Do NOT continue into EXPLORE.**

```
SEED phase complete! Your brainstorm landscape is mapped out with {N} areas,
all at 'unexplored' status.

The mindmap is at: docs/brainstorms/deep/{topic-slug}/

Here's what each session ahead looks like:
- Session 2+: EXPLORE one area per session using targeted creative methodologies
- Later: CONNECT areas, DEEPEN with sub-areas, CONVERGE into synthesis

I suggest starting with "{area}" next because {reason}.

Invoke /deep-brainstorm when you're ready for the next session.
```

**IMPORTANT: This is where the SEED session ends. Do NOT launch research agents.
Do NOT start exploring areas. Do NOT make recommendations. The value of SEED is
the landscape map itself — the areas, questions, and structure. Exploration comes
in future sessions.**

---

### Phase 2: EXPLORE (Multiple Sessions)

**Goal**: Deep-dive one area per session using targeted creative methodology.

#### Session Start

Run **Warm-Up Recap** protocol from `references/session-protocols.md`.

#### Methodology Selection

Select the methodology based on area characteristics:

| Area Characteristic | Primary Methodology | Supporting |
|--------------------|---------------------|------------|
| Concrete/product areas | SCAMPER | Six Thinking Hats |
| Multi-dimensional problems | Morphological Analysis | HMW decomposition |
| Stuck/constrained areas | HMW + Lateral Thinking Provocation | Reverse Brainstorming |
| Risk-heavy areas | Reverse Brainstorming | Premortem |
| Novel/unknown areas | Lateral Thinking Random Entry | SCAMPER |
| Areas with dependencies | Assumption Mapping | Six Thinking Hats |
| Areas needing structure | Lotus Blossom | Morphological Analysis |
| Contradictions detected | TRIZ | Lateral Thinking Challenge |

See `references/creative-methodologies.md` for full methodology procedures.

#### Exploration Flow (Interactive, Not Autonomous)

The EXPLORE session is a CONVERSATION, not a report. Follow this pattern:

1. **Set focus**: Confirm which area to explore. Ask the user: "Ready to dive into {area}? I'll use {methodology} to structure our exploration." **Wait for confirmation.**

2. **Diverge together** (follow Diverge Mode rules from `references/session-protocols.md`):
   - Apply the methodology step by step, presenting each step to the user
   - After each step or prompt, **WAIT for the user's ideas and reactions**
   - Build on what the user says — "That's interesting because..." / "What if we took that further..."
   - Generate your own ideas too, but present them as prompts for discussion, not conclusions
   - Aim for at least 3-4 exchanges per methodology step

3. **Check in**: After diverging, ask: "We've generated a lot here. Want to keep diverging, or start evaluating what we have?"

4. **Converge together** (follow Converge Mode rules):
   - Present the ideas generated and ask the user to react: "Which of these feel strongest? Which feel like dead ends?"
   - Apply evaluation criteria from the methodology
   - Note disagreements — they go to the parking lot or become connection points

5. **Capture**: Update the area's `analysis.md` and `ideas.md` with findings from the conversation

6. **Harvest**: Run Harvest Ritual protocol

**KEY: The user should be contributing ideas in every step, not just answering yes/no questions. If you find yourself writing paragraphs between user responses, you're doing it wrong. Ask shorter, more provocative questions.**

#### Using Subagents for Research (Sparingly)

Research subagents are a SUPPLEMENT to the conversation, not a replacement for it. Use them only when:
- The user asks a factual question you can't answer
- A specific claim needs verification
- The user explicitly asks you to research something

When you do spawn one, keep it narrow:
```
Task(subagent_type="web-search-researcher",
     prompt="Research {ONE specific question relevant to current discussion}.
             Focus on: {specific aspect}. Keep response concise.")
```

Do NOT spawn multiple research agents at once. Do NOT use research as the primary exploration method. The primary method is creative methodology + user interaction.

#### Area Status Updates

After exploring an area, update its status in `_mindmap.yaml`:
- `unexplored` -> `in-progress` when starting exploration
- `in-progress` -> `explored` when one methodology pass is complete
- `explored` -> `deep-dived` when multiple methodologies or sub-area expansion done

---

### Phase 3: CONNECT

**Goal**: Map relationships between areas - synergies, contradictions, dependencies.

**Suggest transition when**: 2+ areas have been explored and patterns between them are emerging.

#### Connection Mapping Process

1. **Review explored areas**: Read each area's `_overview.md` and `ideas.md`
2. **Identify synergies**: Where do ideas in one area reinforce another?
3. **Identify contradictions**: Where do areas pull in opposite directions?
4. **Identify dependencies**: Which areas must be resolved before others?
5. **Document in `_connections.md`** using the template from `references/mindmap-schema.md`

#### Interactive Connection Discovery

Present connections to the user:
```
I've identified these cross-area connections:

Synergies:
- {Area A} + {Area B}: {how they reinforce each other}

Contradictions:
- {Area C} vs {Area D}: {the tension between them}

Dependencies:
- {Area E} depends on {Area F}: {why}

Do you see other connections I've missed?
```

#### Contradiction Resolution

When contradictions are found, flag them for TRIZ resolution in the DEEPEN phase. Add to `_connections.md` with resolution approach noted as "pending TRIZ analysis."

---

### Phase 4: DEEPEN

**Goal**: Expand the most promising or complex areas through sub-area generation, contradiction resolution, and assumption investigation.

#### Lotus Blossom Expansion

For areas that warrant deeper structure (see `references/creative-methodologies.md`):

1. Take the area as the central theme
2. Generate 4-8 sub-aspects
3. Create `sub-areas/{sub-slug}/_overview.md` for each
4. Update `_mindmap.yaml` with sub-area entries

#### TRIZ Resolution

For contradictions identified in CONNECT phase:

1. Frame each contradiction clearly
2. Apply the 10 Inventive Principles from `references/creative-methodologies.md`
3. Generate resolution ideas
4. Document in the relevant area's `analysis.md`

#### Assumption Mapping

For areas with critical dependencies:

1. List all assumptions the area rests on
2. Rate importance x certainty
3. Investigate high-importance/low-certainty assumptions
4. Document findings, update area `_overview.md`

---

### Phase 5: CONVERGE

**Goal**: Synthesize the full landscape into actionable insights using Six Thinking Hats and Premortem analysis.

**Suggest transition when**: Most areas are at `explored` or `deep-dived` status, and the user signals readiness.

#### Six Thinking Hats Sweep

Apply each hat across the ENTIRE brainstorm landscape (not just one area):

| Hat | Question for the landscape |
|-----|---------------------------|
| White | What facts have we established across all areas? What's still unknown? |
| Red | What's the overall gut feeling about this idea now? |
| Black | Across all areas, what are the top risks? |
| Yellow | What are the strongest opportunities we've uncovered? |
| Green | Are there creative combinations across areas we haven't tried? |
| Blue | Did our process cover enough ground? What did we miss? |

#### Premortem

Run a premortem across the full idea:
1. "It's 6 months from now and this has failed. What went wrong?"
2. Leverage insights from ALL areas, not just one
3. Reference specific findings from area analyses
4. Document prevention strategies

#### Synthesis Document

Update `_index.md` with a comprehensive executive summary covering:
- Key insights from each area
- Critical connections and contradictions resolved
- Top opportunities and risks
- Recommended next steps
- Ready-for-plan assessment

#### Final Harvest

Run the final Harvest Ritual with extra attention to:
- Ensuring all area statuses are accurate
- Parking lot items are resolved or explicitly left for future
- Decision log is complete
- `_mindmap.yaml` status set to `complete`

End with:
```
Deep brainstorm CONVERGE phase complete.

Summary: {2-3 sentence synthesis}

The full brainstorm landscape is at: docs/brainstorms/deep/{topic-slug}/

Ready for next steps?
- "Create a plan" -> I'll invoke create-plan using these findings
- "Team brainstorm on {specific area}" -> Adversarial deep-dive on one area
- "Keep exploring" -> We can re-open any area or add new ones
```

---

## Quality Checklist (Per Session)

Before ending any session, verify:

- [ ] All explored content was written to the appropriate area files
- [ ] Ideas generated during the session were captured in relevant `ideas.md`
- [ ] Parking lot was updated with any tangential ideas
- [ ] Decisions were logged if any were made
- [ ] Session log (`sessions/session-NNN.md`) was written with outcomes
- [ ] `_index.md` executive summary reflects current understanding
- [ ] `_mindmap.yaml` was updated LAST with accurate state
- [ ] Next session suggestion is specific and actionable
- [ ] User was offered the choice to continue, pause, or redirect

---

## Integration with Other Skills

### From `brainstorm` or `team-brainstorm`

If a brainstorm or team-brainstorm session reveals a topic needs deeper multi-session exploration:
- Suggest: "This topic has enough depth for a deep brainstorm. Want me to start one?"
- Import key findings as the initial SEED content

### To `create-plan`

When deep-brainstorm reaches CONVERGE with ready-for-plan status:
- The `_index.md` executive summary feeds directly into plan context
- Area analyses inform plan phases
- Decision log maps to plan architectural decisions
- Risk findings map to plan risk mitigations

### To `team-brainstorm`

Individual areas can be sent to team-brainstorm for adversarial analysis:
- Extract area context from `_overview.md` and `analysis.md`
- Team-brainstorm output gets folded back into the area's `ideas.md`

---

## Best Practices

### Session Pacing

- **One area per EXPLORE session** is a good default - going deeper is better than going wider
- **30-minute natural rhythm**: If a session feels like it's losing energy, suggest harvest and resume later
- **Don't force phases**: If the user wants to keep exploring when you'd suggest connecting, follow the user

### Maintaining Engagement

- **Always present the status dashboard** at session start
- **Reference previous session insights** - build on them, don't repeat
- **Make it collaborative**: Ask for the user's ideas, don't just generate
- **Celebrate progress**: "We've now explored 4 of 6 areas - the landscape is really taking shape"

### File Hygiene

- **No empty files**: Every created file should have meaningful stub content
- **Consistent slugs**: Use lowercase-hyphenated names, max 30 characters
- **Update, don't append**: When revisiting an area, update the existing content, don't just append
- **YAML validity**: Always ensure `_mindmap.yaml` is valid YAML after updates

### Methodology Flexibility

- The methodology table is a **starting suggestion**, not a mandate
- If a methodology isn't producing results, switch to another
- Multiple methodologies can be applied to the same area across sessions
- Let the user's energy guide which methodology to use

---

## Anti-Patterns (What NOT To Do)

These are specific failure modes observed in practice. If you catch yourself doing any of these, STOP and course-correct.

### 1. "The Consultant" Anti-Pattern
**Symptom**: You research everything, synthesize findings, present a polished recommendation, and the user just says "ok."
**Fix**: Stop researching. Start asking. The user's brain is the primary source of ideas, not web search results. Your job is to help THEM think, not to think FOR them.

### 2. "The Speedrunner" Anti-Pattern
**Symptom**: SEED phase completes in one message. Areas are identified, directories scaffolded, and you're suggesting "shall I start building?" all before the user has spoken more than once.
**Fix**: Count user responses. If you've reached Step 3 (Area Identification) and the user has responded fewer than 3 times, you skipped the Socratic phase. Go back.

### 3. "The Flat File" Anti-Pattern
**Symptom**: Output goes to `docs/brainstorm/00-something.md` as flat numbered files instead of the mindmap directory structure.
**Fix**: ALL output goes to `docs/brainstorms/deep/{topic-slug}/` with `_mindmap.yaml` as the state file. Check the schema in `references/mindmap-schema.md`.

### 4. "The One-Shot" Anti-Pattern
**Symptom**: Everything happens in one session — SEED, research, analysis, architecture decisions, build plan.
**Fix**: SEED is one session. Each EXPLORE area is one session. Resist the urge to "finish." The VALUE of deep-brainstorm is the depth that comes from spacing sessions apart and letting ideas marinate.

### 5. "The Background Agent" Anti-Pattern
**Symptom**: You spawn 3-5 agents to "research in parallel" while "waiting for results," and the user sits idle for 60+ seconds watching a spinner.
**Fix**: The user should never be idle. If you need to spawn a research agent, do it for ONE specific question and keep talking to the user about something else. Better yet, ask the user the question instead of researching it.

### 6. "The Decision Maker" Anti-Pattern
**Symptom**: During SEED or EXPLORE, you write ADRs, recommend specific technologies, or present a "build sequence."
**Fix**: Deep brainstorm EXPLORES. It does not DECIDE. Decisions happen when the user says "I've decided" or during CONVERGE phase. If you catch yourself writing "Recommendation:" or "Decision:", stop and reframe as a question.

---

## Resources

### references/

- `questioning-frameworks.md` - Socratic, Six Thinking Hats, SCAMPER, Premortem question templates
- `mindmap-schema.md` - YAML schema, directory structure, document templates
- `creative-methodologies.md` - Morphological Analysis, TRIZ, Lateral Thinking, HMW, Assumption Mapping, Reverse Brainstorming, Lotus Blossom
- `session-protocols.md` - Warm-Up Recap, Harvest Ritual, Parking Lot Management, Decision Logging, Phase Transitions, Diverge/Converge modes
