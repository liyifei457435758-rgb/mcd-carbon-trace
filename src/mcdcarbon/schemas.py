from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class Factor:
    id: str
    name: str
    stage: str
    unit: str
    carbon: float
    carbon_low: float
    carbon_high: float
    water_l_per_unit: float = 0.0
    water_low: float = 0.0
    water_high: float = 0.0
    land_m2_year_per_unit: float = 0.0
    land_low: float = 0.0
    land_high: float = 0.0
    source: str = "screening assumption"
    geography: str = "global average"
    scope: str = "screening"
    note: str = ""

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "Factor":
        return cls(
            id=raw["id"], name=raw["name"], stage=raw["stage"], unit=raw["unit"],
            carbon=float(raw["carbon"]), carbon_low=float(raw.get("carbon_low", raw["carbon"])),
            carbon_high=float(raw.get("carbon_high", raw["carbon"])),
            water_l_per_unit=float(raw.get("water_l_per_unit", 0)),
            water_low=float(raw.get("water_low", raw.get("water_l_per_unit", 0))),
            water_high=float(raw.get("water_high", raw.get("water_l_per_unit", 0))),
            land_m2_year_per_unit=float(raw.get("land_m2_year_per_unit", 0)),
            land_low=float(raw.get("land_low", raw.get("land_m2_year_per_unit", 0))),
            land_high=float(raw.get("land_high", raw.get("land_m2_year_per_unit", 0))),
            source=raw.get("source", "screening assumption"), geography=raw.get("geography", "global average"),
            scope=raw.get("scope", "screening"), note=raw.get("note", ""),
        )


@dataclass(frozen=True)
class Component:
    name: str
    quantity_kg: float
    factor_id: str
    display: str = ""


@dataclass(frozen=True)
class Meal:
    id: str
    name: str
    tier: str
    protein: str
    description: str
    components: tuple[Component, ...]
    transport_mass_kg: float
    transport_distance_km: float
    packaging_kg: float
    store_kwh: float
    labor_hours: float
    cost_rmb: float
    mcp_code: str = "fixture"
    source: str = "offline fixture"
    tags: tuple[str, ...] = field(default_factory=tuple)

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "Meal":
        return cls(
            id=raw["id"], name=raw["name"], tier=raw["tier"], protein=raw["protein"],
            description=raw["description"],
            components=tuple(Component(**c) for c in raw["components"]),
            transport_mass_kg=float(raw.get("transport_mass_kg", 0)),
            transport_distance_km=float(raw.get("transport_distance_km", 0)),
            packaging_kg=float(raw.get("packaging_kg", 0)), store_kwh=float(raw.get("store_kwh", 0)),
            labor_hours=float(raw.get("labor_hours", 0)), cost_rmb=float(raw.get("cost_rmb", 0)),
            mcp_code=raw.get("mcp_code", "fixture"), source=raw.get("source", "offline fixture"),
            tags=tuple(raw.get("tags", [])),
        )

