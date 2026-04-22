# Pattern types — structures and extraction criteria

Five pattern types. Each has specific extraction criteria and a YAML template. Use this when extracting or authoring a new pattern.

---

## 1. Error Resolution Patterns

**Definition:** Solutions to errors, exceptions, or unexpected behaviors that required non-obvious fixes.

**Extraction criteria:**
- Error was not immediately obvious from the error message.
- Solution required investigation or research.
- Fix involved understanding underlying cause, not just symptom.
- Solution would be useful if the same error recurs.

**Quality threshold:**
- Must have a specific error trigger (not "it didn't work").
- Must explain root cause, not just provide the fix.
- Must include context for when the pattern applies.

**Template:**
```yaml
type: error_resolution
trigger: "[Exact error message or pattern]"
symptoms:
  - "[Observable symptom 1]"
  - "[Observable symptom 2]"
root_cause: "[Underlying cause]"
solution:
  steps:
    - "[Step 1]"
    - "[Step 2]"
  code_example: |
    // Before (problematic)
    problematic_code_here

    // After (fixed)
    fixed_code_here
context:
  framework: "[Framework/library name]"
  version: "[Version if relevant]"
  environment: "[Environment factors]"
confidence: [0.0-1.0]
times_applied: 0
```

---

## 2. User Correction Patterns

**Definition:** Insights gained when the user corrects Claude's approach, revealing better methods or project-specific preferences.

**Extraction criteria:**
- User explicitly corrected an approach or suggestion.
- Correction revealed a preference not evident from code/docs.
- Learning is transferable to similar situations.
- Correction wasn't due to simple misunderstanding.

**Quality threshold:**
- Must capture the "why" behind the correction.
- Must be generalizable (not a one-off preference).
- Must include clear applicability criteria.

**Template:**
```yaml
type: user_correction
original_approach: "[What Claude initially did/suggested]"
corrected_approach: "[What the user preferred]"
reasoning: "[Why the corrected approach is better]"
applies_when:
  - "[Situation 1]"
  - "[Situation 2]"
project_specific: [true/false]
project_identifier: "[Project name/path if specific]"
confidence: [0.0-1.0]
times_validated: 0
```

---

## 3. Workaround Patterns

**Definition:** Clever solutions to limitations in tools, frameworks, or environments.

**Extraction criteria:**
- Standard approach was blocked by a limitation.
- Workaround achieved the goal despite the limitation.
- Workaround is reliable and maintainable.
- Limitation is likely to be encountered again.

**Quality threshold:**
- Must clearly describe the limitation being worked around.
- Must include caveats and risks.
- Should note when the workaround becomes unnecessary.

**Template:**
```yaml
type: workaround
limitation: "[What was blocked/unavailable]"
goal: "[What we were trying to achieve]"
workaround:
  approach: "[Description of the workaround]"
  steps:
    - "[Step 1]"
    - "[Step 2]"
  code_example: |
    // Workaround implementation
    code_here
caveats:
  - "[Caveat 1]"
  - "[Caveat 2]"
better_alternative: "[What to use when limitation is removed]"
context:
  tool: "[Tool/framework name]"
  version: "[Version with limitation]"
confidence: [0.0-1.0]
```

---

## 4. Debugging Technique Patterns

**Definition:** Effective debugging approaches that proved particularly useful for specific types of problems.

**Extraction criteria:**
- Technique successfully identified a non-obvious issue.
- Approach is systematic and repeatable.
- Would accelerate debugging similar issues.
- Goes beyond basic debugging (not just "add console.log").

**Quality threshold:**
- Must be specific to a problem class (not generic "debugging").
- Must include clear indicators for when to apply.
- Must be actionable with concrete steps.

**Template:**
```yaml
type: debugging_technique
problem_class: "[Type of problem this technique addresses]"
indicators:
  - "[Sign that this technique might help]"
  - "[Another indicator]"
technique:
  name: "[Descriptive name]"
  description: "[How it works]"
  steps:
    - "[Step 1]"
    - "[Step 2]"
    - "[Step 3]"
  tools_used:
    - "[Tool 1]"
    - "[Tool 2]"
example_application: |
  [Concrete example of using this technique]
effectiveness:
  typical_time_saved: "[Estimate]"
  success_rate: "[Estimate]"
confidence: [0.0-1.0]
```

---

## 5. Project-Specific Patterns

**Definition:** Patterns unique to a particular project's conventions, architecture, or domain.

**Extraction criteria:**
- Pattern is specific to current project's codebase.
- Reflects architectural decisions or conventions.
- Would help future work in the same project.
- Not obvious from reading documentation.

**Quality threshold:**
- Must be truly project-specific (not general best practice).
- Must include concrete examples from the codebase.
- Must explain rationale, not just prescription.

**Template:**
```yaml
type: project_specific
project:
  identifier: "[Unique project identifier]"
  path: "[Project root path]"
  description: "[Brief project description]"
pattern:
  name: "[Pattern name]"
  category: "[e.g., naming, architecture, testing, deployment]"
  description: "[What the pattern is]"
  rationale: "[Why this project uses this pattern]"
examples:
  - file: "[file path]"
    line_range: "[start-end]"
    description: "[What this example shows]"
applies_to:
  - "[Situation 1]"
  - "[Situation 2]"
anti_patterns:
  - "[What not to do]"
confidence: [0.0-1.0]
discovered_date: "[ISO date]"
```
