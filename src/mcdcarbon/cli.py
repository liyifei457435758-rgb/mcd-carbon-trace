from __future__ import annotations

import argparse
import json
from pathlib import Path

from .carbon_model import calculate_meal, load_factors, load_meals
from .mcp_client import McdMcpClient


def main() -> int:
    parser = argparse.ArgumentParser(description="McCarbon Trace screening estimator")
    parser.add_argument("--fixture", default="data/fixtures/menu.json")
    parser.add_argument("--factors", default="data/factors.json")
    parser.add_argument("--meal", help="meal id; omit to list meals")
    parser.add_argument("--sync-mcp", action="store_true", help="read current menu through McDonald's MCP")
    args = parser.parse_args()
    if args.sync_mcp:
        client = McdMcpClient()
        print(json.dumps({"initialize": client.initialize(), "tools": client.list_tools()}, ensure_ascii=False, indent=2))
        return 0
    meals = load_meals(args.fixture)
    if not args.meal:
        for meal in meals:
            print(f"{meal.id}\t{meal.name}\t{meal.tier}\t{meal.protein}")
        return 0
    meal = next((item for item in meals if item.id == args.meal), None)
    if meal is None:
        raise SystemExit(f"unknown meal: {args.meal}")
    result = calculate_meal(meal, load_factors(args.factors))
    print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

