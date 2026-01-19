#!/bin/bash
# Context Check Script for Claude Skills Collection
# Checks for saved context files at session start

echo ""
echo "=== Context Check ==="
echo ""

# Check for context files in common locations
found=0

# Check docs/context/
if ls docs/context/CONTEXT-*.md 2>/dev/null | head -1 > /dev/null; then
    echo "Found saved context files in docs/context/:"
    for f in docs/context/CONTEXT-*.md; do
        echo "  - $(basename "$f")"
        found=1
    done
fi

# Check project root
if ls CONTEXT-*.md 2>/dev/null | head -1 > /dev/null; then
    echo "Found context files in project root:"
    for f in CONTEXT-*.md; do
        echo "  - $f"
        found=1
    done
fi

if [ "$found" -eq 1 ]; then
    echo ""
    echo "Consider running /context-loader to resume previous work."
else
    echo "No saved context files found."
fi

echo ""
echo "=== End Context Check ==="
