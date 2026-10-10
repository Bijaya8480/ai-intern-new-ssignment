"""URL validation helpers for the crawler.

Rules (per PRD):
  - Accept only http / https schemes.
  - Reject mailto:, tel:, javascript:, file:, ftp:, data: and anything non-http(s).
  - Resolve + normalize, strip fragment, strip default ports.
  - A URL must point to a reachable, valid domain.
  - SSRF protection: block localhost, private IPs, cloud metadata endpoints.
"""
from __future__ import annotations

import ipaddress
import re
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlparse, urldefrag, urlunparse

import requests
from requests.adapters import HTTPAdapter

from . import normalize_url
from ..constants.languages import DEFAULT_SOURCE_LANGUAGE, LANGUAGES

BLOCKED_SCHEMES = {"mailto", "tel", "javascript", "file", "ftp", "data", "chrome", "about"}
ALLOWED_SCHEMES = {"http", "https"}
NON_HTML_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".zip", ".rar", ".7z",
    ".tar", ".gz", ".exe", ".dmg", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp",
    ".ico", ".css", ".js", ".woff", ".woff2", ".mp3", ".mp4", ".avi", ".mov", ".webm",
    ".json", ".xml", ".csv", ".txt",
}

# Cloud metadata endpoints that should never be accessed
CLOUD_METADATA_HOSTS = {
    "169.254.169.254",      # AWS, GCE, Azure, DigitalOcean
    "metadata.google.internal",  # GCE
    "metadata.azure.com",        # Azure
    "metadata",                  # Generic
}

# The project ships with an in-app demo site hosted on the local backend. This
# is intentionally allowed only for the known /sample-site paths so the app can
# demonstrate the full crawl/translate/publish flow without allowing arbitrary
# SSRF to private network targets.
ALLOWED_LOCAL_DEMO_PATHS = ("/sample-site", "/sample-site/", "/sample-site/index.html")
ALLOWED_LOCAL_DEMO_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "::1"}

# Private IP ranges (RFC 1918, RFC 4193, RFC 3927, RFC 6598)
PRIVATE_IP_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),      # Loopback
    ipaddress.ip_network("169.254.0.0/16"),   # Link-local
    ipaddress.ip_network("100.64.0.0/10"),    # CGNAT
    ipaddress.ip_network("fc00::/7"),         # IPv6 ULA
    ipaddress.ip_network("::1/128"),          # IPv6 loopback
    ipaddress.ip_network("fe80::/10"),        # IPv6 link-local
]


@dataclass
class ValidationResult:
    valid: bool
    normalized: str = ""
    error: str = ""
    status_code: Optional[int] = None


def is_private_ip(host: str) -> bool:
    """Check if a hostname resolves to a private IP address."""
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        # Not an IP address, could be a hostname - we'll check after resolution
        return False
    return any(ip in network for network in PRIVATE_IP_NETWORKS)


def _canonical_host(host: str) -> str:
    """Normalize hostnames so localhost variants and trailing dots are handled consistently."""
    return (host or "").strip().lower().rstrip(".")


def is_cloud_metadata_host(host: str) -> bool:
    """Check if host is a known cloud metadata endpoint."""
    host_lower = _canonical_host(host)
    return host_lower in CLOUD_METADATA_HOSTS


def _is_allowed_local_demo_url(url: str) -> bool:
    """Permit the project demo site while keeping general localhost SSRF blocking in place."""
    try:
        parsed = urlparse(url)
    except Exception:
        return False
    host = _canonical_host(parsed.hostname or "")
    if host not in ALLOWED_LOCAL_DEMO_HOSTS:
        return False
    path = parsed.path or "/"
    return path == "/sample-site" or path.startswith("/sample-site/") or path == "/sample-site/index.html"


def resolve_and_check_host(host: str, url: Optional[str] = None) -> tuple[bool, str]:
    """Resolve hostname and check if it points to a private IP.
    
    Returns (is_blocked, error_message).
    """
    host_lower = _canonical_host(host)
    if not host_lower:
        return False, ""
    if url and _is_allowed_local_demo_url(url):
        return False, ""
    if host_lower in {"localhost", "localhost.localdomain", "127.0.0.1", "0.0.0.0", "::1"} or host_lower.endswith(".localhost"):
        return True, f"Host '{host}' resolves to a localhost or local-only hostname"
    if is_cloud_metadata_host(host_lower):
        return True, f"Host '{host}' is a cloud metadata endpoint"
    try:
        # Try to resolve the hostname
        import socket
        ips = socket.getaddrinfo(host, None)
        for ip_info in ips:
            ip = ip_info[4][0]
            if is_private_ip(ip):
                return True, f"Host '{host}' resolves to private IP '{ip}'"
            if is_cloud_metadata_host(ip):
                return True, f"Host '{host}' resolves to cloud metadata endpoint '{ip}'"
    except socket.gaierror:
        # Could not resolve - allow but will fail at reachability check
        pass
    except Exception:
        # Other resolution errors - allow
        pass
    return False, ""


class UrlValidator:
    """Validate and normalize a website URL."""

    def __init__(self, timeout: int = 10, user_agent: str = "WebsiteLocalizationBot/1.0"):
        self.timeout = timeout
        self.user_agent = user_agent

    @staticmethod
    def _split_scheme(url: str) -> str:
        try:
            return urlparse(url).scheme.lower()
        except Exception:
            return ""

    def validate(self, url: str) -> ValidationResult:
        if not url or not url.strip():
            return ValidationResult(False, error="URL is required")

        url = url.strip()
        scheme = self._split_scheme(url)

        # Reject non-http(s) and blocked schemes outright (before any network call)
        if not scheme:
            # Assume https if scheme missing, e.g. "example.com"
            url = "https://" + url
            scheme = "https"

        if scheme in BLOCKED_SCHEMES:
            return ValidationResult(False, error=f"Unsupported protocol: '{scheme}:' is not allowed")
        if scheme not in ALLOWED_SCHEMES:
            return ValidationResult(False, error=f"Only http/https URLs are allowed (got '{scheme}')")

        parsed = urlparse(url)
        host = parsed.hostname
        if not host:
            return ValidationResult(False, error="Invalid domain: no hostname")

        allowed_demo = _is_allowed_local_demo_url(url)
        if host.startswith("."):
            return ValidationResult(False, error=f"Invalid domain: '{host}'")
        if "." not in host and host.lower() not in ALLOWED_LOCAL_DEMO_HOSTS:
            return ValidationResult(False, error=f"Invalid domain: '{host}'")

        # SSRF protection: Check for localhost and known metadata hosts.
        # Allow the built-in demo site only when the target is the app's trusted
        # /sample-site content; keep the rest of localhost blocked.
        host_lower = _canonical_host(host)
        if (host_lower in ("localhost", "localhost.localdomain", "127.0.0.1", "::1", "0.0.0.0") or host_lower.endswith(".localhost")) and not allowed_demo:
            return ValidationResult(False, error="Localhost URLs are not allowed")
        if is_cloud_metadata_host(host_lower):
            return ValidationResult(False, error="Cloud metadata endpoints are not allowed")

        normalized = normalize_url(url)
        if not normalized:
            return ValidationResult(False, error="Could not normalize URL")

        # SSRF protection: Resolve and check for private IPs
        # Note: We do this after normalization to get the final hostname
        try:
            final_parsed = urlparse(normalized)
            final_host = final_parsed.hostname
            if final_host:
                blocked, error = resolve_and_check_host(final_host, normalized)
                if blocked:
                    return ValidationResult(False, error=error)
        except Exception:
            # If resolution fails, we'll catch it at reachability check
            pass

        return ValidationResult(True, normalized=normalized, error="")

    def reachable(self, normalized_url: str) -> ValidationResult:
        """Lightweight HEAD/GET reachability check (no body parsing)."""
        # Final SSRF check before making request
        try:
            parsed = urlparse(normalized_url)
            host = parsed.hostname
            if host:
                host_lower = _canonical_host(host)
                allowed_demo = _is_allowed_local_demo_url(normalized_url)
                if (host_lower in ALLOWED_LOCAL_DEMO_HOSTS or host_lower.endswith(".localhost")) and not allowed_demo:
                    return ValidationResult(False, error="Localhost URLs are not allowed")
                blocked, error = resolve_and_check_host(host, normalized_url)
                if blocked:
                    return ValidationResult(False, error=error)
        except Exception:
            pass

        sess = requests.Session()
        sess.headers.update({"User-Agent": self.user_agent})
        try:
            resp = sess.get(normalized_url, timeout=self.timeout, allow_redirects=True)
        except requests.RequestException as exc:
            return ValidationResult(False, error=f"Website unreachable: {exc.__class__.__name__}")
        return ValidationResult(True, normalized=normalized_url, status_code=resp.status_code)
