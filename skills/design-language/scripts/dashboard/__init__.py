"""dashboard — page generators for the design-language living styleguide.

assemble_dashboard.py is the thin CLI orchestrator; this package holds the
per-area page builders (overview, tokens, showcase, compare), the contract
generator, the shared HTML primitives (render), and the IO helpers (assets,
brief). Every page is regenerated from css/tokens.css so the styleguide can
never drift from the source of truth (spec §4 invariant).
"""
