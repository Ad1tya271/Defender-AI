const API_URL = "http://127.0.0.1:8000";

// =========================
// Session & Auth Utilities
// =========================

export function isTokenExpired(token: string | null): boolean {
  if (!token) return true;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return true;
    // Decode base64url payload
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const payload = JSON.parse(jsonPayload);
    if (!payload.exp) return false;
    return payload.exp * 1000 <= Date.now() + 5000;
  } catch {
    return true;
  }
}

export function getActiveToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem("access_token");
  if (!token || isTokenExpired(token)) {
    if (token) {
      localStorage.removeItem("access_token");
    }
    return null;
  }
  return token;
}

export function handleSessionExpired() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("access_token");
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login?expired=true";
    }
  }
}

async function handleResponse(response: Response) {
  if (response.status === 401) {
    handleSessionExpired();
    throw new Error("Your session has expired. Please sign in again.");
  }

  if (!response.ok) {
    let message = "Something went wrong";

    try {
      const error = await response.json();
      message = error.detail || message;
    } catch {
      // Keep default message
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

// =========================
// Authentication
// =========================

export async function login(email: string, password: string) {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
    }),
  });

  return handleResponse(response);
}

export async function register(email: string, password: string) {
  const response = await fetch(`${API_URL}/api/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
    }),
  });

  return handleResponse(response);
}

// =========================
// Projects
// =========================

export async function getProjects(token: string) {
  const response = await fetch(`${API_URL}/api/projects`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return handleResponse(response);
}

export async function createProject(
  token: string,
  name: string,
  description: string
) {
  const response = await fetch(`${API_URL}/api/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name,
      description,
    }),
  });

  return handleResponse(response);
}

// =========================
// Scans
// =========================

export type ScannerType = "all" | "semgrep" | "trivy";

export type Scan = {
  id: string;
  project_id: string;
  status: string;
  scanner?: string;
  security_score?: number | null;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  total_findings: number;
  summary?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
};

export async function createScan(
  token: string,
  projectId: string,
  scanner: ScannerType = "all"
): Promise<Scan> {
  const response = await fetch(
    `${API_URL}/api/projects/${projectId}/scans?scanner=${scanner}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return handleResponse(response);
}

export async function getAllScans(token: string): Promise<Scan[]> {
  const response = await fetch(`${API_URL}/api/scans`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return handleResponse(response);
}

export async function getScans(
  token: string,
  projectId: string
): Promise<Scan[]> {
  const response = await fetch(
    `${API_URL}/api/projects/${projectId}/scans`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return handleResponse(response);
}

export async function getScan(
  token: string,
  projectId: string,
  scanId: string
): Promise<Scan> {
  const response = await fetch(
    `${API_URL}/api/projects/${projectId}/scans/${scanId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return handleResponse(response);
}

export async function deleteScan(
  token: string,
  projectId: string,
  scanId: string
) {
  const response = await fetch(
    `${API_URL}/api/projects/${projectId}/scans/${scanId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return handleResponse(response);
}

// =========================
// Findings
// =========================

export type Finding = {
  id: string;
  scan_id: string;
  scanner: string;
  rule_id?: string | null;
  title: string;
  description?: string | null;
  severity: string;
  file_path?: string | null;
  start_line?: number | null;
  end_line?: number | null;
  created_at: string;
};

export type FindingDetail = Finding & {
  code_snippet?: string | null;
};

export async function getFindings(
  token: string,
  scanId: string,
  options?: {
    severity?: string;
    scanner?: string;
    search?: string;
  }
): Promise<Finding[]> {
  const params = new URLSearchParams();

  if (options?.severity) {
    params.set("severity", options.severity);
  }

  if (options?.scanner) {
    params.set("scanner", options.scanner);
  }

  if (options?.search) {
    params.set("search", options.search);
  }

  const query = params.toString();

  const response = await fetch(
    `${API_URL}/api/scans/${scanId}/findings${
      query ? `?${query}` : ""
    }`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return handleResponse(response);
}

export async function getFinding(
  token: string,
  findingId: string
): Promise<FindingDetail> {
  const response = await fetch(
    `${API_URL}/api/findings/${findingId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return handleResponse(response);
}

export async function getFindingSnippet(
  token: string,
  findingId: string
) {
  const response = await fetch(
    `${API_URL}/api/findings/${findingId}/snippet`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return handleResponse(response);
}
// =========================
// Upload
// =========================

export async function uploadProject(
  token: string,
  projectId: string,
  file: File
) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(
    `${API_URL}/api/projects/${projectId}/upload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    }
  );

  return handleResponse(response);
}

// =========================
// AI: Explain / Remediate
// =========================

export type FindingExplanation = {
  root_cause: string;
  attack_vector: string;
  impact: string;
  recommendation: string;
};

export type RemediationSuggestion = {
  explanation: string;
  patch: string;
};

export async function explainFinding(
  token: string,
  findingId: string
): Promise<FindingExplanation> {
  const response = await fetch(
    `${API_URL}/api/findings/${findingId}/explain`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return handleResponse(response);
}

export async function remediateFinding(
  token: string,
  findingId: string
): Promise<RemediationSuggestion> {
  const response = await fetch(
    `${API_URL}/api/findings/${findingId}/remediate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return handleResponse(response);
}

// =========================
// Remediation Proposals & Verification
// =========================

export type VerificationResult = {
  id: string;
  remediation_id: string;
  status: "verified_fixed" | "still_vulnerable" | "new_findings_introduced" | "failed";
  original_findings_count: number;
  remaining_findings_count: number;
  new_findings_count: number;
  scanner: string;
  details?: string | null;
  created_at: string;
};

export type RemediationProposal = {
  id: string;
  finding_id: string;
  user_id: string;
  explanation: string;
  patch: string;
  status: "proposed" | "approved" | "rejected" | "applied";
  target_file?: string | null;
  created_at: string;
  updated_at: string;
  verifications?: VerificationResult[];
};

export async function createRemediationProposal(
  token: string,
  findingId: string,
  data: { explanation: string; patch: string; target_file?: string }
): Promise<RemediationProposal> {
  const response = await fetch(`${API_URL}/api/findings/${findingId}/proposals`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
}

export async function getFindingProposals(
  token: string,
  findingId: string
): Promise<RemediationProposal[]> {
  const response = await fetch(`${API_URL}/api/findings/${findingId}/proposals`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return handleResponse(response);
}

export async function getProjectRemediations(
  token: string,
  projectId: string
): Promise<RemediationProposal[]> {
  const response = await fetch(`${API_URL}/api/projects/${projectId}/remediations`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return handleResponse(response);
}

export async function getRemediationDetail(
  token: string,
  proposalId: string
): Promise<RemediationProposal> {
  const response = await fetch(`${API_URL}/api/remediations/${proposalId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return handleResponse(response);
}

export async function approveRemediation(
  token: string,
  proposalId: string
): Promise<RemediationProposal> {
  const response = await fetch(`${API_URL}/api/remediations/${proposalId}/approve`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return handleResponse(response);
}

export async function rejectRemediation(
  token: string,
  proposalId: string
): Promise<RemediationProposal> {
  const response = await fetch(`${API_URL}/api/remediations/${proposalId}/reject`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return handleResponse(response);
}

export async function verifyRemediation(
  token: string,
  proposalId: string
): Promise<VerificationResult> {
  const response = await fetch(`${API_URL}/api/remediations/${proposalId}/verify`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return handleResponse(response);
}

export async function applyRemediation(
  token: string,
  proposalId: string
): Promise<{ proposal_id: string; status: string; modified_files: string[]; backups: string[] }> {
  const response = await fetch(`${API_URL}/api/remediations/${proposalId}/apply`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return handleResponse(response);
}

export async function rollbackRemediation(
  token: string,
  proposalId: string
): Promise<{ proposal_id: string; status: string; restored_files: string[] }> {
  const response = await fetch(`${API_URL}/api/remediations/${proposalId}/rollback`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return handleResponse(response);
}

// =========================
// System Health & Diagnostics
// =========================

export type SystemHealth = {
  status: "ok" | "degraded";
  execution_mode: string;
  app_env: string;
  timestamp: string;
  database: {
    connected: boolean;
    latency_ms: number | null;
    error: string | null;
  };
  ai_service: {
    reachable: boolean;
    base_url: string;
    configured_model: string;
    model_available: boolean;
    available_models: string[];
    error: string | null;
  };
  scanners: {
    semgrep: {
      installed: boolean;
      path: string;
    };
    trivy: {
      installed: boolean;
      path: string;
    };
  };
};

export async function getSystemHealth(): Promise<SystemHealth> {
  const response = await fetch(`${API_URL}/api/health`, {
    method: "GET",
  });
  return handleResponse(response);
}

export async function saveSnippet(
  token: string,
  projectId: string,
  filename: string,
  code: string
) {
  const response = await fetch(`${API_URL}/api/projects/${projectId}/snippet`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ filename, code }),
  });
  return handleResponse(response);
}