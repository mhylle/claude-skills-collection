@echo off
REM Context Check Script for Claude Skills Collection
REM Checks for saved context files at session start

setlocal enabledelayedexpansion

echo.
echo === Context Check ===
echo.

set "found=0"

REM Check docs\context\
if exist "docs\context\CONTEXT-*.md" (
    echo Found saved context files in docs\context\:
    for %%f in (docs\context\CONTEXT-*.md) do (
        echo   - %%~nxf
        set "found=1"
    )
)

REM Check project root
if exist "CONTEXT-*.md" (
    echo Found context files in project root:
    for %%f in (CONTEXT-*.md) do (
        echo   - %%~nxf
        set "found=1"
    )
)

if "!found!"=="1" (
    echo.
    echo Consider running /context-loader to resume previous work.
) else (
    echo No saved context files found.
)

echo.
echo === End Context Check ===
