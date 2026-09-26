import json
import re
import urllib.error
import urllib.request
from typing import Any

from pydantic import BaseModel, Field


OLLAMA_URL = "http://127.0.0.1:11434/api/chat"
OLLAMA_MODEL = "qwen2.5-coder:7b"


# ============================================================
# RESPONSE SCHEMAS
# ============================================================


class FindingExplanation(BaseModel):
    root_cause: str = Field(
        description="Technical root cause of the vulnerability"
    )
    attack_vector: str = Field(
        description="How an attacker could exploit the vulnerability"
    )
    impact: str = Field(
        description="Potential security impact"
    )
    recommendation: str = Field(
        description="Recommended way to fix the vulnerability"
    )


class RemediationSuggestion(BaseModel):
    explanation: str = Field(
        description="Explanation of the recommended remediation"
    )
    patch: str = Field(
        description="Validated unified diff patch"
    )


# ============================================================
# OLLAMA SERVICE
# ============================================================


class OllamaService:
    """Service for interacting with the local Ollama model."""

    def __init__(
        self,
        url: str = OLLAMA_URL,
        model: str = OLLAMA_MODEL,
    ):
        self.url = url
        self.model = model

    # ========================================================
    # OLLAMA CHAT
    # ========================================================

    def _chat(
        self,
        system_prompt: str,
        user_prompt: str,
    ) -> dict[str, Any]:
        """Send a chat request to Ollama and return parsed JSON."""

        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": system_prompt,
                },
                {
                    "role": "user",
                    "content": user_prompt,
                },
            ],
            "stream": False,
            "format": "json",
            "options": {
                "temperature": 0.1,
            },
        }

        request = urllib.request.Request(
            self.url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(
                request,
                timeout=180,
            ) as response:
                response_data = json.loads(
                    response.read().decode("utf-8")
                )

        except urllib.error.URLError as exc:
            raise RuntimeError(
                f"Unable to connect to Ollama at {self.url}. "
                "Make sure Ollama is running."
            ) from exc

        except TimeoutError as exc:
            raise RuntimeError(
                "Ollama request timed out."
            ) from exc

        content = response_data.get(
            "message",
            {},
        ).get("content")

        if not content:
            raise RuntimeError(
                "Ollama returned an empty response."
            )

        try:
            return json.loads(content)

        except json.JSONDecodeError as exc:
            raise RuntimeError(
                "Ollama returned invalid JSON."
            ) from exc

    # ========================================================
    # EXPLAIN FINDING
    # ========================================================

    def explain_finding(
        self,
        finding: Any,
        code_snippet: str,
    ) -> FindingExplanation:
        """Explain a security finding using the local AI model."""

        scanner = getattr(
            finding,
            "scanner",
            "unknown",
        )

        rule_id = getattr(
            finding,
            "rule_id",
            "unknown",
        )

        title = getattr(
            finding,
            "title",
            "Security finding",
        )

        severity = getattr(
            finding,
            "severity",
            "unknown",
        )

        file_path = getattr(
            finding,
            "file_path",
            "unknown",
        )

        description = getattr(
            finding,
            "description",
            "",
        )

        system_prompt = """
You are a senior application security engineer.

Analyze security findings accurately and conservatively.

Return ONLY valid JSON with exactly these fields:

{
  "root_cause": "...",
  "attack_vector": "...",
  "impact": "...",
  "recommendation": "..."
}

Rules:
- Base the analysis only on the supplied finding and code.
- Do not invent facts that are not supported by the finding or code.
- Do not provide exploit payloads.
- Focus on defensive security analysis.
- Preserve the actual programming language and libraries.
- Make recommendations appropriate for the code shown.
"""

        user_prompt = (
            "Analyze this security finding.\n\n"
            f"Scanner: {scanner}\n"
            f"Rule ID: {rule_id}\n"
            f"Title: {title}\n"
            f"Severity: {severity}\n"
            f"File: {file_path}\n"
            f"Description: {description}\n\n"
            "Code snippet:\n"
            f"{code_snippet}\n\n"
            "Explain:\n"
            "1. The root cause.\n"
            "2. How the vulnerability could be attacked.\n"
            "3. The potential security impact.\n"
            "4. How the developer should fix it."
        )

        result = self._chat(
            system_prompt,
            user_prompt,
        )

        return FindingExplanation.model_validate(result)

    # ========================================================
    # CLEAN AI PATCH
    # ========================================================

    def _clean_patch(
        self,
        patch: str,
    ) -> str:
        """Remove common Markdown/code-fence artifacts."""

        if not patch:
            return ""

        patch = patch.strip()

        if patch.startswith("```"):
            lines = patch.splitlines()

            if len(lines) >= 3:
                if lines[-1].strip() == "```":
                    patch = "\n".join(
                        lines[1:-1]
                    ).strip()

        return patch

    # ========================================================
    # ENSURE UNIFIED DIFF HEADERS
    # ========================================================

    def _ensure_unified_diff_headers(
        self,
        patch: str,
        expected_file: str,
    ) -> str:
        """
        Ensure a unified diff contains deterministic file headers.

        AI models sometimes return only the @@ hunk. Since the target
        file is already known, the backend can safely add the headers.
        """

        patch = self._clean_patch(patch)

        if not patch:
            return ""

        lines = patch.splitlines()

        if not lines:
            return ""

        normalized_file = expected_file.replace(
            "\\",
            "/",
        )

        # Find the first hunk.
        first_hunk = None

        for index, line in enumerate(lines):
            if line.startswith("@@"):
                first_hunk = index
                break

        if first_hunk is None:
            return patch

        before_hunk = lines[:first_hunk]
        hunk_and_after = lines[first_hunk:]

        old_header = None
        new_header = None

        for line in before_hunk:

            if line.startswith("--- "):
                old_header = line

            elif line.startswith("+++ "):
                new_header = line

        # If both headers exist, preserve them.
        if old_header and new_header:
            return "\n".join(
                [
                    old_header,
                    new_header,
                    *hunk_and_after,
                ]
            )

        # Generate deterministic headers.
        return "\n".join(
            [
                f"--- a/{normalized_file}",
                f"+++ b/{normalized_file}",
                *hunk_and_after,
            ]
        )

    # ========================================================
    # NORMALIZE UNIFIED DIFF
    # ========================================================

    def _normalize_unified_diff(
        self,
        patch: str,
    ) -> str:
        """
        Recalculate unified-diff hunk line counts.

        This fixes incorrect @@ metadata generated by the model
        without changing the actual code changes.
        """

        if not patch:
            return ""

        patch = self._clean_patch(patch)

        lines = patch.splitlines()

        if not lines:
            return ""

        normalized: list[str] = []

        index = 0

        while index < len(lines):

            line = lines[index]

            if not line.startswith("@@"):
                normalized.append(line)
                index += 1
                continue

            match = re.match(
                r"^@@ -(\d+)(?:,(\d+))? "
                r"\+(\d+)(?:,(\d+))? @@(.*)$",
                line,
            )

            if not match:
                normalized.append(line)
                index += 1
                continue

            old_start = int(
                match.group(1)
            )

            new_start = int(
                match.group(3)
            )

            trailing = match.group(5)

            hunk_lines: list[str] = []

            index += 1

            while index < len(lines):

                hunk_line = lines[index]

                if hunk_line.startswith("@@"):
                    break

                if hunk_line.startswith("--- "):
                    break

                if hunk_line.startswith("+++ "):
                    break

                hunk_lines.append(hunk_line)

                index += 1

            old_count = 0
            new_count = 0

            for hunk_line in hunk_lines:

                if hunk_line.startswith(" "):
                    old_count += 1
                    new_count += 1

                elif hunk_line.startswith("-"):
                    old_count += 1

                elif hunk_line.startswith("+"):
                    new_count += 1

                elif hunk_line.startswith("\\"):
                    pass

            normalized_header = (
                f"@@ -{old_start},{old_count} "
                f"+{new_start},{new_count} @@"
                f"{trailing}"
            )

            normalized.append(
                normalized_header
            )

            normalized.extend(
                hunk_lines
            )

        return "\n".join(normalized)

    # ========================================================
    # EXTRACT SOURCE LIBRARIES
    # ========================================================

    def _extract_source_libraries(
        self,
        code: str,
    ) -> set[str]:
        """
        Extract top-level Python modules used by the source.

        This is a lightweight guardrail, not a complete Python parser.
        """

        libraries: set[str] = set()

        import_pattern = re.compile(
            r"^\s*import\s+([A-Za-z_][A-Za-z0-9_]*)",
            re.MULTILINE,
        )

        from_pattern = re.compile(
            r"^\s*from\s+([A-Za-z_][A-Za-z0-9_]*)",
            re.MULTILINE,
        )

        for match in import_pattern.finditer(code):
            libraries.add(
                match.group(1)
            )

        for match in from_pattern.finditer(code):
            libraries.add(
                match.group(1)
            )

        known_modules = {
            "sqlite3",
            "sqlalchemy",
            "psycopg2",
            "requests",
            "flask",
            "fastapi",
            "django",
            "pymongo",
            "redis",
            "os",
            "sys",
            "json",
            "subprocess",
            "pathlib",
            "re",
        }

        for module in known_modules:

            if re.search(
                rf"\b{re.escape(module)}\b",
                code,
            ):
                libraries.add(module)

        return libraries

    # ========================================================
    # SEMANTIC PATCH VALIDATION
    # ========================================================

    def _validate_patch_semantics(
        self,
        patch: str,
        code_snippet: str,
        expected_file: str,
    ) -> tuple[bool, str]:
        """
        Validate that the AI patch does not introduce an unrelated
        framework or library.
        """

        if not patch.strip():
            return False, "Patch is empty."

        source_libraries = (
            self._extract_source_libraries(
                code_snippet
            )
        )

        # ----------------------------------------------------
        # Collect added code
        # ----------------------------------------------------

        added_lines: list[str] = []

        for line in patch.splitlines():

            if line.startswith("+++ "):
                continue

            if line.startswith("+"):
                added_lines.append(
                    line[1:]
                )

        added_code = "\n".join(
            added_lines
        )

        added_imports = (
            self._extract_source_libraries(
                added_code
            )
        )

        allowed_stdlib = {
            "os",
            "sys",
            "json",
            "re",
            "pathlib",
            "typing",
            "datetime",
            "uuid",
            "logging",
            "sqlite3",
            "subprocess",
        }

        allowed_libraries = (
            source_libraries
            | allowed_stdlib
        )

        unexpected_imports = (
            added_imports
            - allowed_libraries
        )

        if unexpected_imports:

            return False, (
                "Patch introduces libraries/modules "
                "not present in the supplied source: "
                + ", ".join(
                    sorted(
                        unexpected_imports
                    )
                )
            )

        # ----------------------------------------------------
        # Framework switching protection
        # ----------------------------------------------------

        framework_patterns = {
            "sqlalchemy": [
                r"\bfrom\s+sqlalchemy\b",
                r"\bimport\s+sqlalchemy\b",
                r"\bcreate_engine\s*\(",
                r"\btext\s*\(",
            ],
            "django": [
                r"\bfrom\s+django\b",
                r"\bimport\s+django\b",
            ],
            "flask": [
                r"\bfrom\s+flask\b",
                r"\bimport\s+flask\b",
            ],
            "fastapi": [
                r"\bfrom\s+fastapi\b",
                r"\bimport\s+fastapi\b",
            ],
        }

        for library, patterns in framework_patterns.items():

            if library in source_libraries:
                continue

            for pattern in patterns:

                if re.search(
                    pattern,
                    added_code,
                    re.MULTILINE,
                ):
                    return False, (
                        f"Patch introduces '{library}' "
                        "even though it is not used by "
                        "the supplied source code."
                    )

        # ----------------------------------------------------
        # Verify target file
        # ----------------------------------------------------

        expected_normalized = (
            expected_file.replace(
                "\\",
                "/",
            )
        )

        header_text = "\n".join(
            patch.splitlines()[:2]
        ).replace(
            "\\",
            "/",
        )

        if expected_normalized not in header_text:

            return False, (
                f"Patch does not target the expected "
                f"file '{expected_file}'."
            )

        return True, (
            "Patch semantics are acceptable."
        )

    # ========================================================
    # UNIFIED DIFF VALIDATION
    # ========================================================

    def _validate_unified_diff(
        self,
        patch: str,
        expected_file: str,
    ) -> tuple[bool, str]:
        """Validate unified diff structure and hunk counts."""

        if not patch or not patch.strip():
            return False, "Patch is empty."

        patch = self._clean_patch(patch)

        lines = patch.splitlines()

        if len(lines) < 4:
            return False, (
                "Patch is too short to be a unified diff."
            )

        # ----------------------------------------------------
        # File headers
        # ----------------------------------------------------

        if not lines[0].startswith("--- "):

            return False, (
                "Missing unified diff '---' file header."
            )

        if not lines[1].startswith("+++ "):

            return False, (
                "Missing unified diff '+++' file header."
            )

        old_file = lines[0][4:].strip()
        new_file = lines[1][4:].strip()

        expected_normalized = (
            expected_file.replace(
                "\\",
                "/",
            )
        )

        old_normalized = old_file.replace(
            "\\",
            "/",
        )

        new_normalized = new_file.replace(
            "\\",
            "/",
        )

        if expected_normalized not in old_normalized:

            return False, (
                f"Old file header does not reference "
                f"'{expected_file}'."
            )

        if expected_normalized not in new_normalized:

            return False, (
                f"New file header does not reference "
                f"'{expected_file}'."
            )

        # ----------------------------------------------------
        # Hunk validation
        # ----------------------------------------------------

        hunk_pattern = re.compile(
            r"^@@ -(\d+)(?:,(\d+))? "
            r"\+(\d+)(?:,(\d+))? @@"
        )

        hunks_found = 0

        index = 2

        while index < len(lines):

            line = lines[index]

            if not line.startswith("@@"):
                index += 1
                continue

            match = hunk_pattern.match(
                line
            )

            if not match:

                return False, (
                    f"Invalid hunk header: {line}"
                )

            old_count = int(
                match.group(2) or "1"
            )

            new_count = int(
                match.group(4) or "1"
            )

            index += 1

            actual_old_count = 0
            actual_new_count = 0

            while index < len(lines):

                hunk_line = lines[index]

                if hunk_line.startswith("@@"):
                    break

                if hunk_line.startswith("--- "):

                    return False, (
                        "Unexpected file header "
                        "inside hunk."
                    )

                if hunk_line.startswith("+++ "):

                    return False, (
                        "Unexpected file header "
                        "inside hunk."
                    )

                if hunk_line.startswith(" "):

                    actual_old_count += 1
                    actual_new_count += 1

                elif hunk_line.startswith("-"):

                    actual_old_count += 1

                elif hunk_line.startswith("+"):

                    actual_new_count += 1

                elif hunk_line.startswith("\\"):
                    pass

                else:

                    return False, (
                        "Invalid line inside diff hunk: "
                        f"{hunk_line}"
                    )

                index += 1

            if actual_old_count != old_count:

                return False, (
                    "Hunk old-line count mismatch. "
                    f"Header says {old_count}, "
                    f"actual count is "
                    f"{actual_old_count}."
                )

            if actual_new_count != new_count:

                return False, (
                    "Hunk new-line count mismatch. "
                    f"Header says {new_count}, "
                    f"actual count is "
                    f"{actual_new_count}."
                )

            hunks_found += 1

        if hunks_found == 0:

            return False, (
                "No valid @@ hunk found."
            )

        return True, (
            "Valid unified diff."
        )

    # ========================================================
    # PREPARE / NORMALIZE PATCH
    # ========================================================

    def _prepare_patch(
        self,
        patch: str,
        file_path: str,
    ) -> str:
        """
        Perform deterministic patch cleanup.

        Order:
        1. Remove Markdown fences.
        2. Add missing file headers.
        3. Recalculate hunk counts.
        """

        patch = self._clean_patch(
            patch
        )

        if not patch:
            return ""

        patch = self._ensure_unified_diff_headers(
            patch,
            file_path,
        )

        patch = self._normalize_unified_diff(
            patch
        )

        return patch

    # ========================================================
    # REMEDIATION
    # ========================================================

    def suggest_remediation(
        self,
        finding: Any,
        code_snippet: str,
    ) -> RemediationSuggestion:
        """
        Generate, normalize, validate, and return remediation.
        """

        scanner = getattr(
            finding,
            "scanner",
            "unknown",
        )

        rule_id = getattr(
            finding,
            "rule_id",
            "unknown",
        )

        title = getattr(
            finding,
            "title",
            "Security finding",
        )

        severity = getattr(
            finding,
            "severity",
            "unknown",
        )

        file_path = getattr(
            finding,
            "file_path",
            "unknown",
        )

        description = getattr(
            finding,
            "description",
            "",
        )

        # ----------------------------------------------------
        # Initial AI prompt
        # ----------------------------------------------------

        system_prompt = """
You are a senior application security engineer.

Generate a precise and minimal remediation for the reported
security vulnerability.

Return ONLY valid JSON:

{
  "explanation": "...",
  "patch": "..."
}

PATCH REQUIREMENTS:

1. The patch MUST be a standard unified diff.
2. Include:
   --- a/<file_path>
   +++ b/<file_path>
3. Include at least one @@ hunk header.
4. Show vulnerable lines with '-' prefixes.
5. Show replacement lines with '+' prefixes.
6. Preserve useful unchanged context.
7. Make the smallest possible change.
8. Preserve the existing programming language.
9. Preserve the existing libraries and architecture.
10. Never switch frameworks or libraries unnecessarily.
11. Do not invent files, functions, variables, or APIs.
12. Do not execute or apply the patch.
13. Do not include Markdown fences.
14. Do not provide exploit payloads.
15. Hunk line counts must match the actual hunk.
16. If a safe patch cannot be produced, return an empty patch.

IMPORTANT:
The existing code is authoritative.
Do not rewrite working code using a different framework.
Use the libraries already present in the source code.
"""

        user_prompt = (
            "Create a minimal safe remediation.\n\n"
            f"Scanner: {scanner}\n"
            f"Rule ID: {rule_id}\n"
            f"Title: {title}\n"
            f"Severity: {severity}\n"
            f"File: {file_path}\n"
            f"Description: {description}\n\n"
            "Current code snippet:\n"
            f"{code_snippet}\n\n"
            "Generate a concise explanation and a standard "
            "unified diff.\n"
            "Preserve the existing language and libraries."
        )

        result = self._chat(
            system_prompt,
            user_prompt,
        )

        remediation = (
            RemediationSuggestion.model_validate(
                result
            )
        )

        # ----------------------------------------------------
        # Prepare first patch
        # ----------------------------------------------------

        prepared_patch = self._prepare_patch(
            remediation.patch,
            file_path or "unknown",
        )

        remediation = RemediationSuggestion(
            explanation=remediation.explanation,
            patch=prepared_patch,
        )

        # ----------------------------------------------------
        # Structural validation
        # ----------------------------------------------------

        valid, error = (
            self._validate_unified_diff(
                remediation.patch,
                file_path or "unknown",
            )
        )

        # ----------------------------------------------------
        # Semantic validation
        # ----------------------------------------------------

        if valid:

            valid, error = (
                self._validate_patch_semantics(
                    remediation.patch,
                    code_snippet,
                    file_path or "unknown",
                )
            )

        if valid:
            return remediation

        # ----------------------------------------------------
        # Repair malformed / unsafe patch
        # ----------------------------------------------------

        repair_system_prompt = """
You are a senior software security engineer.

A previous AI generated an invalid remediation patch.

Return ONLY valid JSON:

{
  "explanation": "...",
  "patch": "..."
}

Repair the patch while preserving the intended security fix.

Requirements:
- Standard unified diff.
- Include:
  --- a/<file>
  +++ b/<file>
- Include a valid @@ hunk.
- Correct old/new hunk line counts.
- Preserve existing programming language.
- Preserve existing libraries.
- Do not introduce a new framework.
- Do not invent code.
- Make the smallest possible change.
- No Markdown fences.
- No exploit payloads.

IMPORTANT:
Use the existing code as authoritative.
If the source uses sqlite3, keep sqlite3.
If the source uses requests, keep requests.
If the source uses another library, preserve it.
Do not replace one database library or framework with another.
"""

        repair_user_prompt = (
            "Repair this remediation patch.\n\n"
            f"Target file: {file_path}\n\n"
            f"Validation error:\n{error}\n\n"
            "Original source snippet:\n"
            f"{code_snippet}\n\n"
            "Current patch:\n"
            f"{remediation.patch}\n\n"
            "Return the corrected patch."
        )

        repaired_result = self._chat(
            repair_system_prompt,
            repair_user_prompt,
        )

        repaired = (
            RemediationSuggestion.model_validate(
                repaired_result
            )
        )

        # ----------------------------------------------------
        # Prepare repaired patch
        # ----------------------------------------------------

        repaired_patch = self._prepare_patch(
            repaired.patch,
            file_path or "unknown",
        )

        repaired = RemediationSuggestion(
            explanation=repaired.explanation,
            patch=repaired_patch,
        )

        # ----------------------------------------------------
        # Validate repaired patch
        # ----------------------------------------------------

        valid, repair_error = (
            self._validate_unified_diff(
                repaired.patch,
                file_path or "unknown",
            )
        )

        if valid:

            valid, repair_error = (
                self._validate_patch_semantics(
                    repaired.patch,
                    code_snippet,
                    file_path or "unknown",
                )
            )

        if valid:
            return repaired

        # ----------------------------------------------------
        # Safely withhold invalid patch
        # ----------------------------------------------------

        return RemediationSuggestion(
            explanation=(
                repaired.explanation
                + "\n\n"
                "The AI-generated patch failed security "
                "validation and was therefore withheld."
                f"\n\nValidation reason: "
                f"{repair_error}"
            ),
            patch="",
        )


# ============================================================
# SERVICE INSTANCE
# ============================================================

ollama_service = OllamaService()