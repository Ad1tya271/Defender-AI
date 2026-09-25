import json
import shutil
import subprocess
from pathlib import Path
from typing import List, Dict, Any

SEVERITY_MAP = {
    "CRITICAL": "critical",
    "HIGH": "high",
    "MEDIUM": "medium",
    "LOW": "low",
    "UNKNOWN": "informational",
}


def get_trivy_cmd() -> str:
    """Finds the trivy executable across common installation paths or PATH."""
    candidates = [
        Path(r"C:\Tools\trivy_0.74.0_windows-64bit\trivy.exe"),
        Path(r"C:\Program Files\trivy\trivy.exe"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)

    found = shutil.which("trivy")
    if found:
        return found
    return "trivy"


def run_trivy_scan(target_path: str) -> List[Dict[str, Any]]:
    """
    Runs Trivy vulnerability scanning against the target directory/file
    and returns a list of normalized finding dicts.
    """
    path = Path(target_path)
    if not path.exists():
        raise RuntimeError(f"Scan target does not exist: {target_path}")

    trivy_cmd = get_trivy_cmd()

    try:
        result = subprocess.run(
            [
                trivy_cmd,
                "fs",
                "--format",
                "json",
                "--quiet",
                "--skip-db-update",
                "--skip-check-update",
                str(path),
            ],
            capture_output=True,
            text=True,
            timeout=300,  # 5 minute hard timeout
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("Trivy scan timed out after 5 minutes")
    except FileNotFoundError:
        raise RuntimeError(f"Trivy is not installed or not on PATH ({trivy_cmd})")

    stdout = result.stdout or ""
    if not stdout.strip():
        if result.returncode != 0:
            raise RuntimeError(f"Trivy failed with code {result.returncode}: {result.stderr}")
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
                raise RuntimeError(f"Failed to parse Trivy JSON output: {stdout[:200]}")
        else:
            raise RuntimeError(f"Failed to parse Trivy output: {stdout[:200]}")

    findings: List[Dict[str, Any]] = []
    results_list = data.get("Results", [])

    for target_result in results_list:
        raw_target = target_result.get("Target", str(target_path))
        try:
            clean_file_path = str(Path(raw_target).relative_to(path)).replace("\\", "/")
        except ValueError:
            clean_file_path = str(raw_target).replace("\\", "/")

        vulnerabilities = target_result.get("Vulnerabilities", [])

        for vuln in vulnerabilities:
            vuln_id = vuln.get("VulnerabilityID", "UNKNOWN_CVE")
            pkg_name = vuln.get("PkgName", "")
            installed_ver = vuln.get("InstalledVersion", "")
            raw_severity = vuln.get("Severity", "UNKNOWN").upper()
            title_text = vuln.get("Title") or f"Vulnerability in {pkg_name}"
            display_title = f"[{pkg_name}@{installed_ver}] {title_text}"[:200]
            description = vuln.get("Description", "")

            # Extract line numbers if present in Locations
            locations = vuln.get("Locations", [])
            start_line = locations[0].get("StartLine") if locations else None
            end_line = locations[0].get("EndLine") if locations else None

            findings.append({
                "scanner": "trivy",
                "rule_id": vuln_id,
                "title": display_title,
                "description": description,
                "severity": SEVERITY_MAP.get(raw_severity, "informational"),
                "file_path": clean_file_path,
                "start_line": start_line,
                "end_line": end_line,
            })

    return findings
