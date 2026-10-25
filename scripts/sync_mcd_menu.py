"""Fetch a redacted menu snapshot through McDonald's read-only MCP tools.

The response shape can change with the server. This script deliberately stores the
raw tool result for inspection; it never stores the Authorization header or token.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from mcdcarbon.mcp_client import McdMcpClient


def _parse_tool_text(result: dict) -> dict:
    # The current MCP server exposes the clean JSON envelope in
    # structuredContent.  Prefer it over the human-oriented text block,
    # whose explanatory prose can precede or follow the JSON payload.
    structured = result.get("structuredContent")
    if isinstance(structured, dict) and structured:
        return structured
    text = (result.get("content") or [{}])[0].get("text", "")
    marker = "## Original Response\n\n"
    if marker not in text:
        return {"raw_text": text}
    body = text.split(marker, 1)[1]
    if "## " in body:
        body = body.split("## ", 1)[0]
    try:
        return json.loads(body.strip())
    except json.JSONDecodeError:
        return {"raw_text": text}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="data/mcp_menu_snapshot.json")
    parser.add_argument("--store-code", help="public MCP storeCode; omit with --city/--keyword to discover one")
    parser.add_argument("--city", help="public city used for query-nearby-stores")
    parser.add_argument("--keyword", help="public location keyword used for query-nearby-stores")
    parser.add_argument("--meal-code", action="append", default=[], help="optional code to request with query-meal-detail")
    args = parser.parse_args()
    try:
        client = McdMcpClient()
        initialize = client.initialize()
        tools = client.list_tools()
        store_search = None
        store_code = args.store_code
        if not store_code:
            if not args.city and not args.keyword:
                raise ValueError("provide --store-code or public --city/--keyword so query-meals has a store")
            store_search = client.call_tool("query-nearby-stores", {"beType": 1, "searchType": 2, "city": args.city or "", "keyword": args.keyword or ""})
            search_payload = _parse_tool_text(store_search)
            stores = search_payload.get("data", [])
            if isinstance(stores, dict):
                stores = stores.get("stores", []) or stores.get("storeList", [])
            if not stores:
                raise ValueError("query-nearby-stores returned no public store")
            store_code = stores[0].get("storeCode") or stores[0].get("beCode")
        query_args = {"storeCode": store_code, "orderType": 1, "beType": 1}
        menu_wrapper = client.call_tool("query-meals", query_args)
        menu = _parse_tool_text(menu_wrapper)
        details = {}
        for code in args.meal_code:
            details[code] = _parse_tool_text(client.call_tool("query-meal-detail", {**query_args, "code": code}))
    except Exception as exc:
        print(f"MCP sync failed: {exc}", file=sys.stderr)
        return 2
    payload = {"fetched_at": datetime.now(timezone.utc).isoformat(), "store_code": store_code, "city": args.city, "keyword": args.keyword, "query_args": query_args, "initialize": initialize, "read_only_tools": [t.get("name") for t in tools], "query_meals": menu, "api_response": menu, "meal_details": details, "selected_codes": args.meal_code}
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote MCP menu snapshot to {output}; token was not written.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

