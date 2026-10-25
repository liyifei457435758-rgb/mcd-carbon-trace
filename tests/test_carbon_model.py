from pathlib import Path
import unittest

from mcdcarbon.carbon_model import MissingFactorError, calculate_meal, load_factors, load_meals
from mcdcarbon.mcp_client import McdMcpClient, McdMcpError
from scripts.sync_mcd_menu import _parse_tool_text


ROOT = Path(__file__).parents[1]


class CarbonModelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.factors = load_factors(ROOT / "data/factors.json")
        cls.meals = load_meals(ROOT / "data/fixtures/menu.json")

    def test_fixture_meal_returns_ordered_uncertainty_range(self):
        result = calculate_meal(self.meals[0], self.factors, samples=500)
        self.assertLessEqual(result.carbon_kgco2e["p10"], result.carbon_kgco2e["p50"])
        self.assertLessEqual(result.carbon_kgco2e["p50"], result.carbon_kgco2e["p90"])
        self.assertGreater(result.water_litre["p50"], 0)
        self.assertGreater(result.land_m2_year["p50"], 0)

    def test_missing_factor_is_explicit(self):
        meal = self.meals[0]
        component = meal.components[0].__class__("unknown", 1, "does-not-exist")
        broken = meal.__class__(**{**meal.__dict__, "components": meal.components + (component,)})
        with self.assertRaises(MissingFactorError):
            calculate_meal(broken, self.factors, samples=10)

    def test_transport_is_mass_times_distance_over_thousand(self):
        meal = self.meals[0]
        result = calculate_meal(meal, self.factors, samples=1)
        transport = next(item for item in result.breakdown if item["factor_id"] == "transport-road")
        expected = meal.transport_mass_kg * meal.transport_distance_km / 1000 * self.factors["transport-road"].carbon
        self.assertEqual(transport["carbon_kgco2e"], round(expected, 3))

    def test_all_six_fixture_meals_can_be_calculated(self):
        self.assertEqual(len(self.meals), 6)
        results = [calculate_meal(meal, self.factors, samples=100) for meal in self.meals]
        self.assertGreater(results[-1].carbon_kgco2e["p50"], 0)

    def test_mcp_client_requires_token_and_blocks_side_effects(self):
        with self.assertRaises(McdMcpError):
            McdMcpClient(token="")
        client = McdMcpClient(token="test-only")
        with self.assertRaises(McdMcpError):
            client.call_tool("create-order")

    def test_mcp_parser_prefers_structured_content(self):
        result = {
            "structuredContent": {"success": True, "data": [{"storeCode": "1951020"}]},
            "content": [{"text": "human-readable prose that is not JSON"}],
        }
        parsed = _parse_tool_text(result)
        self.assertEqual(parsed["data"][0]["storeCode"], "1951020")


if __name__ == "__main__":
    unittest.main()

