#!/usr/bin/env python3
"""
Save generated prompts to the docs/prompts directory.

Usage:
    python save_prompt.py <project_root> <phase_number> <phase_name> <prompt_content>

Arguments:
    project_root: The root directory of the project
    phase_number: The phase number (e.g., "1", "2", "3")
    phase_name: The phase name (e.g., "Foundation", "Data Pipeline")
    prompt_content: The generated prompt content (passed via stdin or as argument)

Output:
    Creates a file at <project_root>/docs/prompts/phase-<N>-<name>.md
"""

import sys
import os
from pathlib import Path
from datetime import datetime


def sanitize_filename(name: str) -> str:
    """Convert a phase name to a valid filename component."""
    return name.lower().replace(" ", "-").replace("_", "-")


def save_prompt(project_root: str, phase_number: str, phase_name: str, content: str) -> str:
    """
    Save prompt content to the docs/prompts directory.

    Returns the path to the saved file.
    """
    # Create the prompts directory if it doesn't exist
    prompts_dir = Path(project_root) / "docs" / "prompts"
    prompts_dir.mkdir(parents=True, exist_ok=True)

    # Generate filename
    sanitized_name = sanitize_filename(phase_name)
    filename = f"phase-{phase_number}-{sanitized_name}.md"
    filepath = prompts_dir / filename

    # Add metadata header
    metadata = f"""<!--
Generated: {datetime.now().isoformat()}
Phase: {phase_number} - {phase_name}
-->

"""

    full_content = metadata + content

    # Write the file
    filepath.write_text(full_content, encoding="utf-8")

    return str(filepath)


def main():
    if len(sys.argv) < 4:
        print("Usage: save_prompt.py <project_root> <phase_number> <phase_name>")
        print("       Prompt content is read from stdin")
        sys.exit(1)

    project_root = sys.argv[1]
    phase_number = sys.argv[2]
    phase_name = sys.argv[3]

    # Read content from stdin
    content = sys.stdin.read()

    if not content.strip():
        print("Error: No prompt content provided via stdin")
        sys.exit(1)

    try:
        saved_path = save_prompt(project_root, phase_number, phase_name, content)
        print(f"Prompt saved to: {saved_path}")
    except Exception as e:
        print(f"Error saving prompt: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
