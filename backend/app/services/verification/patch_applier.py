import os
import re
from pathlib import Path
from typing import List, Optional, Tuple


class PatchError(Exception):
    """Raised when patch parsing or application fails."""
    pass


def extract_target_files(diff_text: str) -> List[str]:
    """
    Extracts the target file paths from the unified diff header lines (--- and +++).
    Removes common prefixes like 'a/', 'b/'.
    """
    targets = []
    lines = diff_text.strip().splitlines()
    for line in lines:
        if line.startswith("+++ "):
            # Strip +++ and timestamp/prefix
            raw_path = line[4:].strip()
            # Split off timestamp if separated by tab or double space
            raw_path = re.split(r"[\t\s]{2,}", raw_path)[0].strip()
            # Remove /dev/null
            if raw_path == "/dev/null":
                continue
            # Remove leading a/ or b/
            if raw_path.startswith("b/") or raw_path.startswith("a/"):
                raw_path = raw_path[2:]
            targets.append(raw_path.replace("\\", "/"))
    return targets


def sanitize_relative_path(rel_path: str, base_dir: Path) -> Path:
    """
    Validates that rel_path is strictly inside base_dir, preventing path traversal attacks.
    """
    # Clean string
    cleaned = rel_path.strip().lstrip("/\\")
    full_path = (base_dir / cleaned).resolve()
    base_resolved = base_dir.resolve()

    try:
        full_path.relative_to(base_resolved)
    except ValueError:
        raise PatchError(f"Path traversal detected in patch file path: {rel_path}")

    return full_path


class Hunk:
    def __init__(self, orig_start: int, orig_count: int, new_start: int, new_count: int, lines: List[str]):
        self.orig_start = orig_start
        self.orig_count = orig_count
        self.new_start = new_start
        self.new_count = new_count
        self.lines = lines  # Lines with leading ' ', '-', '+'


def parse_hunks(diff_lines: List[str]) -> List[Hunk]:
    """Parses hunks from diff lines for a single file."""
    hunks: List[Hunk] = []
    current_hunk_lines: List[str] = []
    orig_start = orig_count = new_start = new_count = 0
    in_hunk = False

    hunk_header_re = re.compile(
        r"^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@"
    )

    for line in diff_lines:
        match = hunk_header_re.match(line)
        if match:
            if in_hunk:
                hunks.append(Hunk(orig_start, orig_count, new_start, new_count, current_hunk_lines))
                current_hunk_lines = []

            orig_start = int(match.group(1))
            orig_count = int(match.group(2)) if match.group(2) is not None else 1
            new_start = int(match.group(3))
            new_count = int(match.group(4)) if match.group(4) is not None else 1
            in_hunk = True
        elif in_hunk:
            if line.startswith(("+", "-", " ", "\\")):
                current_hunk_lines.append(line)
            else:
                # Non-diff line inside or after hunk
                pass

    if in_hunk and current_hunk_lines:
        hunks.append(Hunk(orig_start, orig_count, new_start, new_count, current_hunk_lines))

    return hunks


def apply_hunks_to_content(original_content: str, hunks: List[Hunk]) -> str:
    """
    Applies parsed hunks to original file content lines.
    Handles exact line positions with fallback window searching if lines shifted.
    """
    # Normalize newlines
    has_trailing_newline = original_content.endswith("\n")
    orig_lines = original_content.splitlines()

    result_lines = list(orig_lines)
    offset = 0

    for hunk in hunks:
        # Extract expected original lines and replacement lines from hunk
        expected_context: List[str] = []
        replacement: List[str] = []

        for hline in hunk.lines:
            if hline.startswith(" "):
                expected_context.append(hline[1:])
                replacement.append(hline[1:])
            elif hline.startswith("-"):
                expected_context.append(hline[1:])
            elif hline.startswith("+"):
                replacement.append(hline[1:])
            elif hline.startswith("\\"):
                # "\ No newline at end of file"
                pass

        # Try to find target position
        target_idx = (hunk.orig_start - 1) + offset

        # Search window for matching context if line numbers shifted
        matched_idx = -1
        if 0 <= target_idx <= len(result_lines) - len(expected_context):
            # Check if target_idx matches directly
            if result_lines[target_idx : target_idx + len(expected_context)] == expected_context:
                matched_idx = target_idx

        if matched_idx == -1:
            # Fuzzy scan nearby lines (-10 to +10 lines)
            max_delta = 20
            for delta in range(1, max_delta + 1):
                for candidate in (target_idx - delta, target_idx + delta):
                    if 0 <= candidate <= len(result_lines) - len(expected_context):
                        if result_lines[candidate : candidate + len(expected_context)] == expected_context:
                            matched_idx = candidate
                            break
                if matched_idx != -1:
                    break

        if matched_idx == -1:
            # Full file scan for unique match of expected context
            matches = []
            for i in range(len(result_lines) - len(expected_context) + 1):
                if result_lines[i : i + len(expected_context)] == expected_context:
                    matches.append(i)
            if len(matches) == 1:
                matched_idx = matches[0]

        if matched_idx == -1:
            raise PatchError(
                f"Hunk at line {hunk.orig_start} failed to apply: expected context not found in target file."
            )

        # Splice in the replacement
        result_lines[matched_idx : matched_idx + len(expected_context)] = replacement
        offset += len(replacement) - len(expected_context)

    final_content = "\n".join(result_lines)
    if has_trailing_newline:
        final_content += "\n"
    return final_content


def apply_patch_to_workspace(
    workspace_dir: Path,
    patch_text: str,
    target_file_hint: Optional[str] = None,
) -> List[Path]:
    """
    Safely applies a unified diff patch to files in workspace_dir.
    Returns the list of modified Path objects.
    """
    if not workspace_dir.exists() or not workspace_dir.is_dir():
        raise PatchError(f"Workspace directory does not exist: {workspace_dir}")

    # Clean patch text of markdown formatting if wrapped in ```diff ... ```
    cleaned_patch = patch_text.strip()
    if cleaned_patch.startswith("```"):
        first_newline = cleaned_patch.find("\n")
        if first_newline != -1:
            cleaned_patch = cleaned_patch[first_newline + 1:]
        if cleaned_patch.endswith("```"):
            cleaned_patch = cleaned_patch[:-3].strip()

    diff_lines = cleaned_patch.splitlines()

    # Find file targets in patch
    targets = extract_target_files(cleaned_patch)
    if not targets and target_file_hint:
        targets = [target_file_hint]

    if not targets:
        raise PatchError("No target files found in patch and no target_file hint was provided.")

    hunks = parse_hunks(diff_lines)
    if not hunks:
        raise PatchError("No valid diff hunks (@@ ... @@) found in patch.")

    modified_files = []
    # If single target file or multiple targets match the hunks
    for target in targets:
        target_path = sanitize_relative_path(target, workspace_dir)
        if not target_path.exists():
            # Try target_file_hint if target_path does not exist
            if target_file_hint:
                alt_path = sanitize_relative_path(target_file_hint, workspace_dir)
                if alt_path.exists():
                    target_path = alt_path

        if not target_path.exists():
            raise PatchError(f"Target file to patch not found: {target_path}")

        try:
            with open(target_path, "r", encoding="utf-8", errors="replace") as f:
                original_content = f.read()
        except Exception as e:
            raise PatchError(f"Failed to read target file {target_path}: {e}")

        patched_content = apply_hunks_to_content(original_content, hunks)

        try:
            with open(target_path, "w", encoding="utf-8", newline="\n") as f:
                f.write(patched_content)
            modified_files.append(target_path)
        except Exception as e:
            raise PatchError(f"Failed to write patched content to {target_path}: {e}")

    return modified_files
