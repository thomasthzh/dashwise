import importlib.util
import pathlib
import unittest


MODULE_PATH = pathlib.Path(__file__).with_name("card_exporter.py")
SPEC = importlib.util.spec_from_file_location("hkvps_card_exporter", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class SnapshotTests(unittest.TestCase):
    def test_builds_allowlisted_application_states_and_host_metrics(self):
        snapshot = MODULE.build_snapshot(
            unit_probe=lambda unit: unit != "cloudflared.service",
            http_probe=lambda port: port != 29374,
            host_probe=lambda: {
                "cpuPercent": 8.5,
                "memoryPercent": 14.6,
                "diskPercent": 34.8,
                "uptimeSeconds": 900,
                "load1": 0.42,
            },
        )

        self.assertEqual(snapshot["services"]["adguard"], {"state": "online"})
        self.assertEqual(
            snapshot["services"]["syncaction"],
            {"state": "degraded", "online": 1, "total": 2},
        )
        self.assertEqual(
            snapshot["services"]["edge"],
            {"state": "degraded", "online": 2, "total": 3},
        )
        self.assertEqual(snapshot["host"]["cpuPercent"], 8.5)


if __name__ == "__main__":
    unittest.main()
