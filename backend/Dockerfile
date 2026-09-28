# ============================================================
# DefenderAI Backend Container (Python 3.12 + Semgrep + Trivy)
# ============================================================
FROM python:3.12-slim-bookworm

LABEL maintainer="DefenderAI Security Team"
LABEL description="DefenderAI Core Analysis Engine & API"

# Install system dependencies (curl for Trivy & health checks, git for SAST)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Trivy security scanner
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then TRIVY_ARCH="64bit"; \
    elif [ "$ARCH" = "aarch64" ]; then TRIVY_ARCH="ARM64"; \
    else TRIVY_ARCH="64bit"; fi && \
    curl -sfL "https://github.com/aquasecurity/trivy/releases/download/v0.58.2/trivy_0.58.2_Linux-${TRIVY_ARCH}.tar.gz" | tar -xz -C /usr/local/bin trivy && \
    chmod +x /usr/local/bin/trivy

WORKDIR /app

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy source code and entrypoint
COPY . .

# Setup ephemeral workspaces directory with open permissions
RUN mkdir -p /app/scan-workspaces && chmod 777 /app/scan-workspaces

# Install entrypoint
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Default environment configuration
ENV PYTHONPATH=/app \
    PYTHONUNBUFFERED=1 \
    SEMGREP_PATH=/usr/local/bin/semgrep \
    TRIVY_PATH=/usr/local/bin/trivy

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
