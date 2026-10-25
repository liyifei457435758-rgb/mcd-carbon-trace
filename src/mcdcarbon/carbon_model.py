from __future__ import annotations

import json
import random
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from .schemas import Factor, Meal


class MissingFactorError(KeyError):
    """Raised when a meal references a factor that is not in the factor table."""


@dataclass
class ImpactResult:
    meal_id: str
    meal_name: str
    carbon_kgco2e: dict[str, float]
    water_litre: dict[str, float]
    land_m2_year: dict[str, float]
    labor_hours: dict[str, float]
    cost_rmb: dict[str, float]
    breakdown: list[dict[str, Any]]
    provenance: list[dict[str, Any]]
    method: str = "screening LCA; triangular factor uncertainty"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def load_factors(path: str | Path) -> dict[str, Factor]:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return {item["id"]: Factor.from_dict(item) for item in raw["factors"]}


def load_meals(path: str | Path) -> list[Meal]:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return [Meal.from_dict(item) for item in raw["meals"]]


def _triangular(rng: random.Random, low: float, mode: float, high: float) -> float:
    if high < low:
        raise ValueError("factor high must be >= low")
    return rng.triangular(low, high, mode)


def _metric_samples(meal: Meal, factors: dict[str, Factor], samples: int, seed: int) -> tuple[list[float], list[float], list[float]]:
    rng = random.Random(seed)
    carbon: list[float] = []
    water: list[float] = []
    land: list[float] = []
    transport = factors["transport-road"]
    grid = factors["store-electricity"]
    pack = factors["paper-packaging"]
    for _ in range(samples):
        c = w = l = 0.0
        for component in meal.components:
            if component.factor_id not in factors:
                raise MissingFactorError(component.factor_id)
            f = factors[component.factor_id]
            q = component.quantity_kg
            c += q * _triangular(rng, f.carbon_low, f.carbon, f.carbon_high)
            w += q * _triangular(rng, f.water_low, f.water_l_per_unit, f.water_high)
            l += q * _triangular(rng, f.land_low, f.land_m2_year_per_unit, f.land_high)
        c += (meal.transport_mass_kg * meal.transport_distance_km / 1000) * _triangular(rng, transport.carbon_low, transport.carbon, transport.carbon_high)
        c += meal.store_kwh * _triangular(rng, grid.carbon_low, grid.carbon, grid.carbon_high)
        c += meal.packaging_kg * _triangular(rng, pack.carbon_low, pack.carbon, pack.carbon_high)
        w += meal.packaging_kg * _triangular(rng, pack.water_low, pack.water_l_per_unit, pack.water_high)
        l += meal.packaging_kg * _triangular(rng, pack.land_low, pack.land_m2_year_per_unit, pack.land_high)
        carbon.append(c)
        water.append(w)
        land.append(l)
    return carbon, water, land


def _percentile(values: list[float], p: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    index = (len(ordered) - 1) * p
    lower, upper = int(index), min(int(index) + 1, len(ordered) - 1)
    fraction = index - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction


def _range(values: list[float]) -> dict[str, float]:
    return {"p10": round(_percentile(values, 0.10), 3), "p50": round(_percentile(values, 0.50), 3), "p90": round(_percentile(values, 0.90), 3)}


def calculate_meal(meal: Meal, factors: dict[str, Factor], samples: int = 3000, seed: int = 42) -> ImpactResult:
    """Calculate a meal without silently filling missing factors."""
    carbon, water, land = _metric_samples(meal, factors, samples, seed)
    breakdown: list[dict[str, Any]] = []
    provenance: dict[str, dict[str, Any]] = {}
    for component in meal.components:
        f = factors[component.factor_id]
        breakdown.append({"name": component.display or component.name, "stage": f.stage, "carbon_kgco2e": round(component.quantity_kg * f.carbon, 3), "factor_id": f.id})
        provenance[f.id] = {"name": f.name, "source": f.source, "geography": f.geography, "scope": f.scope, "unit": f.unit, "note": f.note}
    transport = factors["transport-road"]
    grid = factors["store-electricity"]
    pack = factors["paper-packaging"]
    breakdown.extend([
        {"name": "门店电力", "stage": grid.stage, "carbon_kgco2e": round(meal.store_kwh * grid.carbon, 3), "factor_id": grid.id},
        {"name": "包装", "stage": pack.stage, "carbon_kgco2e": round(meal.packaging_kg * pack.carbon, 3), "factor_id": pack.id},
        {"name": "运输", "stage": transport.stage, "carbon_kgco2e": round(meal.transport_mass_kg * meal.transport_distance_km / 1000 * transport.carbon, 3), "factor_id": transport.id},
    ])
    provenance.update({f.id: {"name": f.name, "source": f.source, "geography": f.geography, "scope": f.scope, "unit": f.unit, "note": f.note} for f in (transport, grid, pack)})
    return ImpactResult(
        meal_id=meal.id, meal_name=meal.name, carbon_kgco2e=_range(carbon), water_litre=_range(water), land_m2_year=_range(land),
        labor_hours={"value": round(meal.labor_hours, 2)}, cost_rmb={"value": round(meal.cost_rmb, 2)},
        breakdown=breakdown, provenance=list(provenance.values()),
    )

