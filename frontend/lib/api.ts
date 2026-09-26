const API_URL = "http://127.0.0.1:8000";

async function handleResponse(response: Response) {
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