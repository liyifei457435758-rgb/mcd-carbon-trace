from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any


READ_ONLY_TOOLS = {"query-meals", "query-meal-detail", "list-nutrition-foods", "now-time-info", "query-nearby-stores", "campaign-calendar"}


class McdMcpError(RuntimeError):
    pass


class McdMcpClient:
    """Minimal Streamable HTTP MCP client; credentials stay outside the repository."""

    def __init__(self, endpoint: str = "https://mcp.mcd.cn", token: str | None = None, timeout: int = 30):
        self.endpoint = endpoint
        self.token = token or os.getenv("MCD_MCP_TOKEN")
        self.timeout = timeout
        self.session_id: str | None = None
        if not self.token:
            raise McdMcpError("MCD_MCP_TOKEN is not set in this PowerShell process; set it here and retry")

    def _post(self, payload: dict[str, Any]) -> Any:
        headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json", "Accept": "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18"}
        if self.session_id:
            headers["Mcp-Session-Id"] = self.session_id
        request = urllib.request.Request(self.endpoint, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                self.session_id = response.headers.get("Mcp-Session-Id") or self.session_id
                content = response.read().decode("utf-8", "replace")
                if "text/event-stream" in response.headers.get("Content-Type", ""):
                    data_lines = [line[6:] for line in content.splitlines() if line.startswith("data:")]
                    return json.loads(data_lines[-1]) if data_lines else {}
                return json.loads(content) if content else {}
        except urllib.error.HTTPError as exc:
            raise McdMcpError(f"MCP HTTP {exc.code}; token rejected or request invalid") from exc
        except urllib.error.URLError as exc:
            raise McdMcpError(f"MCP network error: {exc.reason}") from exc

    def initialize(self) -> dict[str, Any]:
        result = self._post({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "mcdcarbon-trace", "version": "0.1.0"}}})
        self._post({"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})
        return result

    def list_tools(self) -> list[dict[str, Any]]:
        response = self._post({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
        return response.get("result", {}).get("tools", [])

    def call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> Any:
        if name not in READ_ONLY_TOOLS:
            raise McdMcpError(f"blocked non-read-only MCP tool: {name}")
        response = self._post({"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": name, "arguments": arguments or {}}})
        if "error" in response:
            raise McdMcpError(response["error"].get("message", "MCP tool call failed"))
        return response.get("result")

