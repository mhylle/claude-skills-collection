@echo off
REM Context Check Script for Claude Skills Collection
REM Run this to check for saved context files

setlocal enabledelayedexpansion

echo.
echo === Context Check ===
echo.

REM Check for context files
set "found=0"
if exist "docs\context\CONTEXT-*.md" (
    echo Found saved context files:
    echo.
    for %%f in (docs\context\CONTEXT-*.md) do (
        echo   - %%~nxf
        set "found=1"
    )
    echo.
    echo Consider running /context-loader to resume previous work.
) else (
    echo No saved context files found in docs\context\
)

REM Also check root directory
if exist "CONTEXT-*.md" (
    echo.
    echo Found context files in root:
    for %%f in (CONTEXT-*.md) do (
        echo   - %%~nxf
    )
)

echo.
echo === End Context Check ===
