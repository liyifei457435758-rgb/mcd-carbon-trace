"""Turn a read-only MCP menu snapshot into six explainable screening meals."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


# Product codes are read from the live menu.  The family-meal code has changed
# across menu snapshots (the current 2026-10-25 response uses 9900016055), so
# callers should prefer passing --meal-code values from the latest snapshot.
DEFAULT_CODES = ["9900005466", "9900016055", "9900005462", "9900005411", "9900005453", "9900005428"]

# A transparent screening scenario for money inputs.  The MCP exposes menu
# prices and item structure, but it does not expose supplier invoices,
# wages, rent, utility bills or capital depreciation.  Keep the rates here
# so the UI can show the full-chain cost as an editable assumption rather
# than silently presenting the selling price as production cost.
RAW_COST_RMB_PER_KG = {
    "beef": 42.0,
    "chicken": 24.0,
    "bun": 8.0,
    "cheese": 28.0,
    "lettuce": 4.0,
    "sauce": 10.0,
    "potato": 5.5,
    "cola": 2.0,
    "chicken_patty": 24.0,
}


def _cost_breakdown(meal: dict[str, Any], labor_chain: list[dict[str, Any]]) -> dict[str, Any]:
    """Estimate cash inputs from farm to last-mile delivery.

    This is deliberately an auditable scenario, not McDonald's accounting:
    each line is a cost pool and can later be replaced with measured data.
    Values are rounded only at the end so the displayed total equals the sum
    of the visible lines.
    """
    components = meal.get("components", [])
    raw = sum(float(p.get("quantity_kg", 0)) * RAW_COST_RMB_PER_KG.get(str(p.get("factor_id")), 8.0) for p in components)
    servings = 2 if float(meal.get("transport_mass_kg", 0)) > 1.0 else 1
    mass = float(meal.get("transport_mass_kg", 0))
    tonne_km = mass * float(meal.get("transport_distance_km", 0)) / 1000
    minutes = {str(stage.get("id")): float(stage.get("minutes", 0)) for stage in labor_chain}
    store_minutes = sum(minutes.get(key, 0) for key in ("store-receiving", "cashier", "cooking", "packing"))
    delivery_minutes = minutes.get("delivery", 0)

    lines = [
        {"id": "raw-materials", "label": "原料采购与初级产品", "amount": raw, "basis": "各原料 kg × 原料采购价"},
        {"id": "farm-inputs", "label": "农场 / 饲料 / 灌溉投入", "amount": raw * 0.90, "basis": "原料采购价 × 90% 上游投入情景"},
        {"id": "processing", "label": "中央厨房 / 加工", "amount": raw * 0.45 + 2.5 * servings, "basis": "原料价 × 45% + 每份加工固定投入"},
        {"id": "cold-chain", "label": "仓储 / 冷链", "amount": mass * 1.40, "basis": "运输质量 kg × ¥1.40"},
        {"id": "transport", "label": "干线运输", "amount": tonne_km * 6.50 + 1.20, "basis": "t·km × ¥6.50 + 车辆调度分摊"},
        {"id": "store-facility", "label": "门店装修 / 灶台设备折旧", "amount": 8.0 + 4.0 * servings, "basis": "农场、加工线、门店设备与装修的订单分摊"},
        {"id": "utilities", "label": "煤气 / 电力 / 用水", "amount": float(meal.get("store_kwh", 0)) * 2.30 + 0.75 * servings, "basis": "门店 kWh × ¥2.30 + 燃气与用水情景"},
        {"id": "store-labor", "label": "门店收货 / 收银 / 制作 / 包装人工", "amount": store_minutes / 60 * 32.0, "basis": "门店 person-minutes × ¥32/h"},
        {"id": "packaging", "label": "外包装纸 / 印刷", "amount": float(meal.get("packaging_kg", 0)) * 32.0 + 1.0, "basis": "包装 kg × ¥32 + 印刷与耗材"},
        {"id": "delivery", "label": "司机 / 末端配送", "amount": delivery_minutes / 60 * 35.0 + 1.50, "basis": "配送 person-minutes × ¥35/h + 车辆末端分摊"},
    ]
    for line in lines:
        line["amount"] = round(max(0.0, line["amount"]), 2)
    total = round(sum(line["amount"] for line in lines), 2)
    return {
        "scenario": "full-chain-screening-v1",
        "currency": "CNY",
        "total_rmb": total,
        "lines": lines,
        "note": "非麦当劳财务数据；MCP 未提供供应商发票、工资、租金或折旧，金额为可替换的项目情景。",
    }


def _defaults(detail: dict[str, Any]) -> list[str]:
    names: list[str] = []
    for round_item in (detail.get("data", {}).get("rounds", []) or []):
        choices = [c for c in (round_item.get("choices", []) or []) if c.get("isDefault") == 1]
        if choices:
            names.extend(str(c.get("name", "")) for c in choices)
    return names


def _protein(name: str) -> tuple[str, str]:
    if any(token in name for token in ("鸡", "鸡腿", "麦乐鸡", "麦香鸡")):
        return "鸡肉", "chicken"
    if any(token in name for token in ("鱼", "鳕", "虾")):
        return "鱼类", "chicken"
    return "牛肉", "beef"


def _components(protein_factor: str, servings: int) -> list[dict[str, Any]]:
    base = [
        {"name": "蛋白质主料", "quantity_kg": 0.105, "factor_id": protein_factor, "display": "蛋白质主料"},
        {"name": "面包胚", "quantity_kg": 0.075, "factor_id": "bun", "display": "面包胚"},
        {"name": "奶酪/蔬菜/酱料估算", "quantity_kg": 0.042, "factor_id": "sauce", "display": "蔬菜与酱料"},
        {"name": "薯条马铃薯", "quantity_kg": 0.13, "factor_id": "potato", "display": "默认薯条"},
        {"name": "饮料", "quantity_kg": 0.30, "factor_id": "cola", "display": "默认饮料"},
    ]
    for item in base:
        item["quantity_kg"] = round(item["quantity_kg"] * servings, 4)
    return base


def _labor_chain(servings: int) -> list[dict[str, Any]]:
    """Project scenario for cumulative person-minutes across the delivery chain.

    MCP returns menu structure and price, not supplier or restaurant staffing data.
    Keep this scenario explicit so a later measured dataset can replace it.
    """
    single = [
        ("farm", "养殖 / 种植分摊", 4), ("central-kitchen", "中央厨房与加工", 7),
        ("logistics", "仓储与干线运输", 2), ("store-receiving", "门店收货", 1.5),
        ("cashier", "收银与接单", 1), ("cooking", "汉堡与薯条制作", 4),
        ("packing", "组装与包装", 2), ("delivery", "司机与末端配送", 7),
    ]
    return [{"id": item_id, "label": label, "minutes": minutes * (servings if item_id not in {"cashier", "delivery"} else 1)} for item_id, label, minutes in single]


def normalize(snapshot: dict[str, Any]) -> dict[str, Any]:
    api = snapshot.get("api_response", {})
    menu = api.get("data", {}).get("meals", {}) or {}
    details = snapshot.get("meal_details", {}) or {}
    codes = snapshot.get("selected_codes") or DEFAULT_CODES
    meals: list[dict[str, Any]] = []
    for code in codes:
        info = menu.get(code)
        detail = details.get(code, {})
        if not info:
            continue
        name = str(info.get("name", code))
        defaults = _defaults(detail)
        protein_label, protein_factor = _protein(name + " " + " ".join(defaults))
        servings = 2 if any(token in name for token in ("双人", "亲子", "分享")) else 1
        tier = "双人餐" if servings == 2 else ("三件套" if "三件套" in name else "单人餐")
        price = float(re.sub(r"[^0-9.]", "", str(info.get("currentPrice", "0"))) or 0)
        slug = f"mcp-{code}"
        labor_chain = _labor_chain(servings)
        draft_meal = {
            "components": _components(protein_factor, servings),
            "transport_mass_kg": round(0.72 * servings, 3),
            "transport_distance_km": 180,
            "packaging_kg": round(0.05 * servings, 3),
            "store_kwh": round(0.18 * servings, 3),
        }
        cost_model = _cost_breakdown(draft_meal, labor_chain)
        meals.append({
            "id": slug, "name": name, "tier": tier, "protein": protein_label,
            "description": "MCP 默认搭配：" + " / ".join(defaults[:5]) if defaults else "MCP 餐品详情已读取；配方克重为筛选估算",
            "mcp_code": code, "source": f"MCP live menu · store {snapshot.get('store_code', '')} · {snapshot.get('fetched_at', '')}",
            "tags": ["MCP实时", protein_label, tier], "components": draft_meal["components"],
            "transport_mass_kg": round(0.72 * servings, 3), "transport_distance_km": 180,
            "packaging_kg": round(0.05 * servings, 3), "store_kwh": round(0.18 * servings, 3),
            "labor_scenario": "delivery-default", "labor_chain": labor_chain,
            "labor_hours": round(sum(stage["minutes"] for stage in labor_chain) / 60, 3),
            "menu_price_rmb": price, "cost_rmb": cost_model["total_rmb"],
            "cost_model": cost_model,
        })
    return {"metadata": {"source": "McDonald's MCP query-meals + query-meal-detail", "store_code": snapshot.get("store_code"), "fetched_at": snapshot.get("fetched_at"), "recipe_weight_status": "estimated; MCP does not disclose supplier recipe grams"}, "meals": meals}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot", default="data/mcp_menu_snapshot.json")
    parser.add_argument("--output", default="data/mcp_meals.json")
    args = parser.parse_args()
    result = normalize(json.loads(Path(args.snapshot).read_text(encoding="utf-8")))
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(result['meals'])} normalized MCP meals to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

