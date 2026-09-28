import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.core.config import settings

SEVERITY_MAP = {
    "CRITICAL": "critical",
    "ERROR": "high",
    "WARNING": "medium",
    "INFO": "low",
    "EXPERIMENT": "informational",
    "INVENTORY": "informational",
}


def get_semgrep_cmd() -> str:
    """Finds the semgrep executable across custom config, virtual environment or PATH."""
    if settings.SEMGREP_PATH and Path(settings.SEMGREP_PATH).exists():
        return settings.SEMGREP_PATH

    venv_dir = Path(sys.executable).parent
    candidates = [
        venv_dir / "semgrep.exe",
        venv_dir / "semgrep",
        Path(sys.prefix) / "Scripts" / "semgrep.exe",
        Path(sys.prefix) / "bin" / "semgrep",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)

    found = shutil.which("semgrep")
    if found:
        return found
    return "semgrep"


def parse_semgrep_output(stdout: str, base_path: Optional[Path] = None) -> List[Dict[str, Any]]:
    """
    Parses and normalizes raw Semgrep JSON output into the common Finding schema.
    Extracts rule IDs, messages, severity, line numbers, CWE, and OWASP metadata.
    """
    if not stdout or not stdout.strip():
        return []

    try:
        data = json.loads(stdout)
    except json.JSONDecodeError:
        # Fallback: extract substring between first { and last }
        start_idx = stdout.find("{")
        end_idx = stdout.rfind("}")
        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
            try:
                data = json.loads(stdout[start_idx : end_idx + 1])
            except json.JSONDecodeError:
                raise RuntimeError(f"Failed to parse Semgrep JSON output: {stdout[:200]}")
        else:
            raise RuntimeError(f"Failed to parse Semgrep output: {stdout[:200]}")

    findings: List[Dict[str, Any]] = []
    results = data.get("results", [])

    for item in results:
        extra = item.get("extra", {})
        raw_severity = str(extra.get("severity", "INFO")).upper()
        raw_path = item.get("path", "")

        if base_path:
            try:
                clean_file_path = str(Path(raw_path).relative_to(base_path)).replace("\\", "/")
            except ValueError:
                clean_file_path = str(raw_path).replace("\\", "/")
        else:
            clean_file_path = str(raw_path).replace("\\", "/")

        message = extra.get("message", "Semgrep security finding")
        metadata = extra.get("metadata", {})

        # Enrich description with CWE and OWASP tags if present
        details = [message]
        cwe = metadata.get("cwe")
        if cwe:
            cwe_str = ", ".join(cwe) if isinstance(cwe, list) else str(cwe)
            details.append(f"CWE: {cwe_str}")
        owasp = metadata.get("owasp")
        if owasp:
            owasp_str = ", ".join(owasp) if isinstance(owasp, list) else str(owasp)
            details.append(f"OWASP: {owasp_str}")

        start_line = item.get("start", {}).get("line")
        end_line = item.get("end", {}).get("line")

        findings.append({
            "scanner": "semgrep",
            "rule_id": item.get("check_id"),
            "title": message[:200],
            "description": "\n\n".join(details),
            "severity": SEVERITY_MAP.get(raw_severity, "low"),
            "file_path": clean_file_path,
            "start_line": start_line,
            "end_line": end_line,
        })

    return findings


def run_semgrep_scan(target_path: str) -> List[Dict[str, Any]]:
    """
    Runs Semgrep against the given directory and returns a list of
    normalized finding dicts. Raises RuntimeError on scan failure.
    """
    path = Path(target_path)
    if not path.exists():
        raise RuntimeError(f"Scan target does not exist: {target_path}")

    semgrep_cmd = get_semgrep_cmd()
    timeout = settings.SCAN_TIMEOUT_SECONDS

    try:
        result = subprocess.run(
            [semgrep_cmd, "--config=auto", "--no-git-ignore", "--json", "--quiet", str(path)],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"Semgrep scan timed out after {timeout} seconds")
    except FileNotFoundError:
        raise RuntimeError(f"Semgrep is not installed or not on PATH ({semgrep_cmd})")

    stdout = result.stdout or ""
    if not stdout.strip():
        if result.returncode not in (0, 1):
            raise RuntimeError(f"Semgrep failed with code {result.returncode}: {result.stderr}")
        return []

    return parse_semgrep_output(stdout, base_path=path)