import json
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.core.config import settings

SEVERITY_MAP = {
    "CRITICAL": "critical",
    "HIGH": "high",
    "MEDIUM": "medium",
    "LOW": "low",
    "UNKNOWN": "informational",
}


def get_trivy_cmd() -> str:
    """Finds the trivy executable across custom config, common installation paths or PATH."""
    if settings.TRIVY_PATH and Path(settings.TRIVY_PATH).exists():
        return settings.TRIVY_PATH

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


def parse_trivy_output(stdout: str, base_path: Optional[Path] = None) -> List[Dict[str, Any]]:
    """
    Parses and normalizes raw Trivy JSON output into the common Finding schema.
    Handles both dependency vulnerabilities (SCA) and misconfigurations/secrets.
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
                raise RuntimeError(f"Failed to parse Trivy JSON output: {stdout[:200]}")
        else:
            raise RuntimeError(f"Failed to parse Trivy output: {stdout[:200]}")

    findings: List[Dict[str, Any]] = []
    results_list = data.get("Results", [])

    for target_result in results_list:
        raw_target = target_result.get("Target", "")
        if base_path:
            try:
                clean_file_path = str(Path(raw_target).relative_to(base_path)).replace("\\", "/")
            except ValueError:
                clean_file_path = str(raw_target).replace("\\", "/")
        else:
            clean_file_path = str(raw_target).replace("\\", "/")

        # 1. Dependency Vulnerabilities
        vulnerabilities = target_result.get("Vulnerabilities", [])
        for vuln in vulnerabilities:
            vuln_id = vuln.get("VulnerabilityID", "UNKNOWN_CVE")
            pkg_name = vuln.get("PkgName", "")
            installed_ver = vuln.get("InstalledVersion", "")
            fixed_ver = vuln.get("FixedVersion")
            raw_severity = str(vuln.get("Severity", "UNKNOWN")).upper()
            title_text = vuln.get("Title") or f"Vulnerability in {pkg_name}"

            display_title = f"[{pkg_name}@{installed_ver}] {title_text}"[:200]

            desc_parts = []
            if vuln.get("Description"):
                desc_parts.append(vuln["Description"])
            if fixed_ver:
                desc_parts.append(f"Remediation: Upgrade {pkg_name} to version {fixed_ver} or higher.")
            primary_url = vuln.get("PrimaryURL")
            if primary_url:
                desc_parts.append(f"Reference: {primary_url}")

            locations = vuln.get("Locations", [])
            start_line = locations[0].get("StartLine") if locations else None
            end_line = locations[0].get("EndLine") if locations else None

            findings.append({
                "scanner": "trivy",
                "rule_id": vuln_id,
                "title": display_title,
                "description": "\n\n".join(desc_parts) if desc_parts else "No description provided.",
                "severity": SEVERITY_MAP.get(raw_severity, "informational"),
                "file_path": clean_file_path,
                "start_line": start_line,
                "end_line": end_line,
            })

        # 2. Misconfigurations (IaC, Dockerfile, etc.)
        misconfigs = target_result.get("Misconfigurations", [])
        for mis in misconfigs:
            rule_id = mis.get("ID", "MISCONFIG")
            title = mis.get("Title", "Configuration issue")
            raw_severity = str(mis.get("Severity", "LOW")).upper()
            desc_parts = [mis.get("Description", "")]
            if mis.get("Message"):
                desc_parts.append(f"Details: {mis['Message']}")
            if mis.get("Resolution"):
                desc_parts.append(f"Resolution: {mis['Resolution']}")

            cause = mis.get("CauseMetadata", {})
            start_line = cause.get("StartLine")
            end_line = cause.get("EndLine")

            findings.append({
                "scanner": "trivy",
                "rule_id": rule_id,
                "title": f"[Misconfig] {title}"[:200],
                "description": "\n\n".join(desc_parts),
                "severity": SEVERITY_MAP.get(raw_severity, "low"),
                "file_path": clean_file_path,
                "start_line": start_line,
                "end_line": end_line,
            })

    return findings


def run_trivy_scan(target_path: str) -> List[Dict[str, Any]]:
    """
    Runs Trivy vulnerability scanning against the target directory/file
    and returns a list of normalized finding dicts.
    """
    path = Path(target_path)
    if not path.exists():
        raise RuntimeError(f"Scan target does not exist: {target_path}")

    trivy_cmd = get_trivy_cmd()
    timeout = settings.SCAN_TIMEOUT_SECONDS

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
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"Trivy scan timed out after {timeout} seconds")
    except FileNotFoundError:
        raise RuntimeError(f"Trivy is not installed or not on PATH ({trivy_cmd})")

    stdout = result.stdout or ""
    if not stdout.strip():
        if result.returncode != 0:
            raise RuntimeError(f"Trivy failed with code {result.returncode}: {result.stderr}")
        return []

    return parse_trivy_output(stdout, base_path=path)

