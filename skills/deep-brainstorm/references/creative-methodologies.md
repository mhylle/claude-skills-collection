# Creative Methodologies Reference

Advanced creative thinking methodologies for deep brainstorming. These complement the Socratic, Six Thinking Hats, SCAMPER, and Premortem frameworks in `questioning-frameworks.md`.

---

## Morphological Analysis

**When to use**: Multi-dimensional problems where combinations of parameters create the solution space. Best for areas with distinct, independent dimensions.

### Procedure

1. **Define the problem** clearly in one sentence
2. **Identify parameters** (3-6 independent dimensions of the problem)
3. **List variations** for each parameter (3-5 options per dimension)
4. **Build the matrix** combining parameters and variations
5. **Explore combinations** systematically, marking promising intersections

### Matrix Template

```
Parameter    | Variation A | Variation B | Variation C | Variation D
-------------|-------------|-------------|-------------|------------
Dimension 1  |             |             |             |
Dimension 2  |             |             |             |
Dimension 3  |             |             |             |
Dimension 4  |             |             |             |
```

### Evaluation

For each promising combination:
- **Feasibility**: Can this be built/done? (1-5)
- **Novelty**: Is this different from existing solutions? (1-5)
- **Value**: Does this solve the core problem well? (1-5)
- **Total**: Sum of scores, prioritize highest

### Example Application

Problem: "How should we handle user notifications?"

```
Parameter    | Push       | Email      | In-App     | SMS
-------------|------------|------------|------------|----------
Timing       | Real-time  | Batched    | On-demand  | Scheduled
Priority     | All        | High-only  | User-set   | Smart/ML
Grouping     | Individual | By type    | By project | Digest
```

Explore: "Batched + High-only + Digest + Email" vs "Real-time + Smart/ML + Individual + Push"

---

## TRIZ (Simplified for Software/Design)

**When to use**: When you've identified a contradiction - improving one aspect seems to worsen another. TRIZ provides systematic resolution principles.

### Contradiction Identification

1. State the desired improvement: "We want to improve {X}"
2. State what worsens: "But that degrades {Y}"
3. Frame as: "How can we improve {X} without degrading {Y}?"

### 10 Most Applicable Inventive Principles

| # | Principle | Software/Design Application | Trigger Question |
|---|-----------|---------------------------|------------------|
| 1 | **Segmentation** | Decompose into microservices, modules, plugins | "Can we break this into independent pieces?" |
| 2 | **Extraction** | Extract the useful part, separate concerns | "Can we pull out just the valuable element?" |
| 3 | **Local Quality** | Different configs per environment, adaptive UI | "Can different parts have different properties?" |
| 4 | **Asymmetry** | Asymmetric read/write paths, CQRS | "What if the two sides don't have to match?" |
| 5 | **Merging** | Combine related operations, batch processing | "Can we do these together instead of separately?" |
| 6 | **Universality** | One component serves multiple purposes | "Can one thing serve multiple needs?" |
| 7 | **Nesting** | Composition, middleware chains, decorators | "Can we put one thing inside another?" |
| 8 | **Counterweight** | Caching to offset latency, pre-computation | "Can we compensate with an opposing force?" |
| 9 | **Prior Action** | Pre-processing, warm caches, prefetching | "Can we do this in advance?" |
| 10 | **Copying** | Use a model/simulation instead of the real thing | "Can we use a copy, mock, or simulation?" |

### Resolution Process

1. Identify the contradiction clearly
2. Scan the 10 principles - which ones suggest approaches?
3. For each applicable principle, generate 2-3 concrete ideas
4. Evaluate: Does the idea resolve the contradiction without creating new ones?

---

## Lateral Thinking Techniques

**When to use**: When conventional analysis produces predictable results. When you're stuck in familiar patterns and need a creative jolt.

### Random Entry

**Purpose**: Force unexpected connections by introducing a random stimulus.

**Procedure**:
1. Select a random word, image, or concept (use a dictionary, random word generator, or pick something from your environment)
2. List 5-10 attributes or associations of the random element
3. Force-connect each attribute to the problem
4. Explore the most surprising connections - even absurd ones

**Trigger prompts**:
- "If this problem were a {random noun}, what would it look like?"
- "What does {random concept} have in common with our challenge?"
- "How would someone in the {random profession} industry approach this?"
- "What if our solution had to incorporate the principle of {random word}?"

### Provocation (PO)

**Purpose**: Deliberately make an outrageous statement to escape conventional thinking. The prefix "PO" signals this is a provocation, not a serious proposal.

**Procedure**:
1. State: "PO: {outrageous reversal or exaggeration}"
2. **Do NOT dismiss it** - instead, "move forward from" the provocation
3. Ask: "What's interesting about this? What does it make me think of?"
4. Extract the useful seed hidden in the provocation

**Provocation templates**:
- "PO: Users don't want this at all"
- "PO: The system does the opposite of what's intended"
- "PO: We have infinite {constrained resource}"
- "PO: {Core feature} doesn't exist"
- "PO: {Stakeholder} does our job for us"
- "PO: Everything happens at once / nothing ever changes"

### Challenge

**Purpose**: Question things that are accepted as normal, not because they're wrong, but to see if alternatives exist.

**Procedure**:
1. Identify something taken for granted: "Why do we do it this way?"
2. Challenge is NOT criticism - it's curiosity about alternatives
3. Ask: "Is there another way? What if this weren't required?"
4. The value comes even if the current way turns out to be best - understanding WHY confirms the approach

**Challenge targets**:
- Boundaries: "Why does the boundary sit here?"
- Processes: "Why these steps in this order?"
- Conventions: "Why is this the standard approach?"
- Assumptions: "Why do we believe this must be true?"

### Harvesting

**Purpose**: Extract usable ideas from creative thinking sessions, even "failed" ideas.

**Categories**:
- **Direct ideas**: Ready to use as-is
- **Seedlings**: Interesting but need development
- **Directions**: Point toward promising areas but aren't concrete yet
- **Principles**: Underlying concepts that could apply broadly
- **New focus areas**: Problems or opportunities we hadn't considered

---

## How Might We (HMW) Questions

**When to use**: To transform constraints, problems, or observations into opportunity-framed questions that invite creative solutions.

### Formulation Rules

1. Start with "How might we..."
2. Be specific enough to guide ideation but broad enough to allow multiple solutions
3. Avoid embedding a solution in the question
4. One problem per HMW - decompose complex problems

### Constraint-to-Opportunity Transform

| Constraint | Bad HMW (too broad) | Bad HMW (solution embedded) | Good HMW |
|-----------|--------------------|-----------------------------|----------|
| "Users forget passwords" | "HMW improve auth?" | "HMW add biometrics?" | "HMW make re-authentication frictionless?" |
| "API is too slow" | "HMW make it faster?" | "HMW add Redis cache?" | "HMW deliver results before users notice latency?" |
| "Too many config options" | "HMW simplify?" | "HMW remove options?" | "HMW give users the right config without asking?" |

### Decomposition Pattern

Start with a broad HMW, then decompose into actionable sub-questions:

```
HMW make onboarding feel effortless?
├── HMW reduce the number of steps to get started?
├── HMW show value before asking for setup?
├── HMW learn user preferences without explicit questions?
└── HMW make each step feel rewarding rather than obligatory?
```

### HMW Generation Session

1. Take one problem/observation/constraint
2. Generate 5-10 HMW questions (diverge - no filtering)
3. Vote/select the 2-3 most promising
4. Use selected HMWs as starting points for ideation with other methodologies

---

## Assumption Mapping

**When to use**: When moving toward decisions and need to understand what underlying beliefs the approach rests on. Critical before converging.

### Step 1: List Assumptions

Brainstorm all assumptions the idea relies on:
- "We assume users will..."
- "We assume the technology can..."
- "We assume the market will..."
- "We assume we have the resources to..."
- "We assume [competitor/partner] won't..."

### Step 2: Rate Each Assumption

| Assumption | Importance (1-5) | Certainty (1-5) | Quadrant |
|-----------|-------------------|------------------|----------|
| {assumption} | {how critical to success} | {how confident we are} | {see below} |

### Step 3: Prioritize by Quadrant

```
                    HIGH IMPORTANCE
                         |
    INVESTIGATE          |         MONITOR
    (High importance,    |    (High importance,
     Low certainty)      |     High certainty)
    ** TOP PRIORITY **   |    Safe foundations
                         |
   ----------------------+----------------------
                         |
    IGNORE               |         NOTE
    (Low importance,     |    (Low importance,
     Low certainty)      |     High certainty)
    Don't waste time     |    Background context
                         |
                    LOW IMPORTANCE
```

### Step 4: Investigate

For each "Investigate" quadrant assumption:
1. What evidence would confirm or refute this?
2. Can we run a quick experiment or prototype?
3. Who could we ask?
4. What's the fallback if this assumption is wrong?

---

## Reverse Brainstorming

**When to use**: When direct ideation feels stuck. By thinking about how to cause failure, we often uncover creative solutions.

### Procedure

1. **State the goal**: "We want to achieve {X}"
2. **Invert**: "How could we guarantee {X} fails?" or "How could we make {opposite of X} happen?"
3. **Generate failure causes**: Brainstorm enthusiastically - the worse, the better
4. **Re-invert each cause**: For each failure cause, flip it into a positive action
5. **Evaluate**: Which re-inverted ideas are novel and actionable?

### Example

**Goal**: "Make the API easy to use"
**Inverted**: "How could we make the API impossible to use?"

| Failure Cause | Re-inverted Solution |
|--------------|---------------------|
| No documentation at all | Interactive API explorer with live examples |
| Change endpoints weekly | Versioned API with migration guides |
| Return cryptic error codes | Error responses with fix suggestions and doc links |
| Require 50 headers per request | Smart defaults, progressive disclosure of options |
| Different auth per endpoint | Unified auth with scope-based permissions |

### Tips

- Embrace absurdity in step 3 - the most ridiculous failure causes often produce the most creative solutions
- Group similar failure causes before re-inverting
- Some re-inverted ideas will be obvious (that's fine) - focus on the surprising ones

---

## Lotus Blossom (Mandala Chart)

**When to use**: To systematically expand from a central theme into 8 branches, then 64 sub-ideas. Maps directly to the sub-areas directory structure.

### Structure

```
                    [Branch B]
                        |
           [Branch A]---+---[Branch C]
              |         |         |
 [Branch H]--[  CENTRAL THEME  ]--[Branch D]
              |         |         |
           [Branch G]---+---[Branch E]
                        |
                    [Branch F]
```

Each branch then becomes its own center with 8 sub-ideas.

### Procedure

1. **Place central theme** in the middle
2. **Identify 8 branches** (aspects, dimensions, stakeholders, components)
3. **For each branch**, generate 8 sub-ideas or sub-aspects
4. **Map to directories**: Each branch = area, each sub-idea = sub-area

### Directory Mapping

```
areas/
├── {branch-a-slug}/
│   ├── _overview.md        # Branch A overview
│   └── sub-areas/
│       ├── {sub-1}/        # Sub-idea A1
│       ├── {sub-2}/        # Sub-idea A2
│       └── ...             # Up to 8 sub-areas
├── {branch-b-slug}/
│   └── ...
└── ...                     # Up to 8 areas
```

### Tips

- Not every branch needs exactly 8 sub-ideas - aim for 4-8
- Some branches will naturally have more depth than others
- Use the sub-areas for the most promising/complex branches only
- Cross-reference connections between branches in `_connections.md`

---

## Methodology Selection Guide

| Area Characteristic | Recommended Methodology | Why |
|--------------------|------------------------|-----|
| Concrete/product areas | SCAMPER | Systematic modification of existing concepts |
| Multi-dimensional problems | Morphological Analysis | Explores combination space systematically |
| Stuck/constrained areas | HMW + Lateral Thinking Provocation | Reframes constraints as opportunities |
| Risk-heavy areas | Reverse Brainstorming | Failure-first thinking reveals hidden solutions |
| Novel/unknown areas | Lateral Thinking Random Entry | Forces connections outside comfort zone |
| Areas with dependencies | Assumption Mapping | Surfaces and prioritizes uncertain foundations |
| Areas needing expansion | Lotus Blossom | Systematic branching creates structure |
| Contradictions detected | TRIZ | Resolves opposing requirements systematically |
