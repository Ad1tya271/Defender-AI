import subprocess
import json
from pathlib import Path

SEVERITY_MAP = {
    "ERROR": "high",
    "WARNING": "medium",
    "INFO": "low",
}

def run_semgrep_scan(target_path: str) -> list[dict]:
    """
    Runs Semgrep against the given directory and returns a list of
    normalized finding dicts. Raises RuntimeError on scan failure.
    """
    path = Path(target_path)
    if not path.exists():
        raise RuntimeError(f"Scan target does not exist: {target_path}")

    try:
        result = subprocess.run(
            ["semgrep", "--config=auto", "--json", str(path)],
            capture_output=True,
            text=True,
            timeout=300,  # 5 minute hard timeout
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("Semgrep scan timed out after 5 minutes")
    except FileNotFoundError:
        raise RuntimeError("Semgrep is not installed or not on PATH")

    if not result.stdout:
        raise RuntimeError(f"Semgrep produced no output. stderr: {result.stderr}")

    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        raise RuntimeError("Failed to parse Semgrep JSON output")

    findings = []
    for item in data.get("results", []):
        extra = item.get("extra", {})
        raw_severity = extra.get("severity", "INFO")

        findings.append({
            "scanner": "semgrep",
            "rule_id": item.get("check_id"),
            "title": extra.get("message", "Semgrep finding")[:200],
            "description": extra.get("message"),
            "severity": SEVERITY_MAP.get(raw_severity, "low"),
            "file_path": item.get("path"),
            "start_line": item.get("start", {}).get("line"),
            "end_line": item.get("end", {}).get("line"),
        })

    return findings