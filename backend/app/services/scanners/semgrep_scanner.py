import json
import shutil
import subprocess
import sys
from pathlib import Path

SEVERITY_MAP = {
    "ERROR": "high",
    "WARNING": "medium",
    "INFO": "low",
}


def get_semgrep_cmd() -> str:
    """Finds the semgrep executable across virtual environment or PATH."""
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


def run_semgrep_scan(target_path: str) -> list[dict]:
    """
    Runs Semgrep against the given directory and returns a list of
    normalized finding dicts. Raises RuntimeError on scan failure.
    """
    path = Path(target_path)
    if not path.exists():
        raise RuntimeError(f"Scan target does not exist: {target_path}")

    semgrep_cmd = get_semgrep_cmd()

    try:
        result = subprocess.run(
            [semgrep_cmd, "--config=auto", "--no-git-ignore", "--json", "--quiet", str(path)],
            capture_output=True,
            text=True,
            timeout=300,  # 5 minute hard timeout
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("Semgrep scan timed out after 5 minutes")
    except FileNotFoundError:
        raise RuntimeError(f"Semgrep is not installed or not on PATH ({semgrep_cmd})")

    stdout = result.stdout or ""
    if not stdout.strip():
        if result.returncode not in (0, 1):
            raise RuntimeError(f"Semgrep failed with code {result.returncode}: {result.stderr}")
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

    findings = []
    for item in data.get("results", []):
        extra = item.get("extra", {})
        raw_severity = extra.get("severity", "INFO")
        raw_path = item.get("path", "")
        try:
            clean_file_path = str(Path(raw_path).relative_to(path)).replace("\\", "/")
        except ValueError:
            clean_file_path = str(raw_path).replace("\\", "/")

        findings.append({
            "scanner": "semgrep",
            "rule_id": item.get("check_id"),
            "title": extra.get("message", "Semgrep finding")[:200],
            "description": extra.get("message"),
            "severity": SEVERITY_MAP.get(raw_severity, "low"),
            "file_path": clean_file_path,
            "start_line": item.get("start", {}).get("line"),
            "end_line": item.get("end", {}).get("line"),
        })

    return findings