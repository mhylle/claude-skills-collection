This file is a work in progress. A proper prompt library will be added later.

# Testing
When testing it can be useful to use an iterative approach. This prompt worked in one project, it needs to be generalized to it can be used in other test scenarios:

Read docs/context/WORKFLOW-TESTING-METHODOLOGY.md first.

  Execute the Research Agent workflow test with these rules:

  1. **Test Query**: "What Christmas markeds are there in Aarhus next weekend?"
1a. "Log to verify": "ab91423b-b4a3-44d1-b680-8430badd6d2b" - planning is still in progress even though the search is done
  2. **Sequential Testing**: Test each stage in order (1-8), never skip
  3. **Fix Before Proceeding**: Any error MUST be fixed before moving to next stage
  4. **Start from Beginning**: When testing stage N, execute stages 1 to N-1 first
  5. **Subagent Delegation**: Use subagents for isolated investigation or implementation tasks
  6. **Final Validation**: Use Playwright MCP to verify in browser:
     - Result visible seen on the SAME page as the research itself.  Seeing it under the history does not count as a success
     - Tool calls > 0
     - Status = "completed"
     - Sources displayed

  Begin with Stage 1: Submit the test query via API and verify logId is returned.

  After every 3-4 tool calls, remind yourself of these rules and current progress.
Keep a progress indicator file "test_progress.md". make sure to update this whenever you are reminding yourself.
Make sure that the rules are readable from that file also
