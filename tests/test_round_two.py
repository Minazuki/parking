import json
from pathlib import Path
import subprocess
import importlib.util
import tempfile
import unittest
from unittest.mock import patch

module_path = Path(__file__).resolve().parents[1] / "tools/round-two/py/main.py"
spec = importlib.util.spec_from_file_location("round_two_core", module_path)
round_two = importlib.util.module_from_spec(spec)
spec.loader.exec_module(round_two)
draw, prepare = round_two.draw, round_two.prepare


class RoundTwoTests(unittest.TestCase):
    def test_cli_prepares_draws_and_refuses_to_overwrite_results(self):
        root = Path(__file__).resolve().parents[1]
        (root / "tmp").mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=root / "tmp") as directory:
            prepared = Path(directory) / "prepared.json"
            result = Path(directory) / "result.json"
            base = [str(root / "tools/round-two.sh")]
            subprocess.run(base + ["prepare", "--input", str(root / "examples/round-two-bicycle.json"), "--output", str(prepared)], check=True, capture_output=True)
            command = base + ["draw", "--input", str(prepared), "--output", str(result)]
            subprocess.run(command, check=True, capture_output=True)
            saved = result.read_text(encoding="utf-8")
            self.assertEqual(len(json.loads(saved)["assignments"]), 2)
            self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)
            self.assertEqual(result.read_text(encoding="utf-8"), saved)

    def test_review_combines_vacancies_and_unpaid_preserving_paid_spaces(self):
        allocations = [
            {"household": "TEST-A", "space": "大1", "paid": True},
            {"household": "TEST-B", "space": "大2", "paid": False},
        ]
        result = prepare("bicycle_large", ["TEST-C"], allocations, ["大3"], True)
        self.assertEqual(result["available_spaces"], ["大3", "大2"])
        self.assertEqual(result["released_allocations"][0]["household"], "TEST-B")
        self.assertEqual(allocations[0]["space"], "大1")

    def test_review_requires_confirmation_and_explicit_payment(self):
        with self.assertRaises(ValueError):
            prepare("bicycle_large", [], [], [], False)
        for paid in [None, 0, "false"]:
            with self.subTest(paid=paid), self.assertRaises(ValueError):
                prepare("bicycle_large", [], [{"household": "TEST-A", "space": "大1", "paid": paid}], [], True)

    def test_no_participants_skips_randomness_and_preserves_spaces(self):
        with patch.object(round_two.random, "SystemRandom", side_effect=AssertionError("Must not draw")):
            result = draw("bicycle_small", [], ["小39"])
        self.assertEqual(result["status"], "skipped_no_participants")
        self.assertEqual(result["remaining_spaces"], ["小39"])

    def test_no_spaces_skips_and_keeps_waiting_households(self):
        result = draw("bicycle_large", ["TEST-A"], [])
        self.assertEqual(result["status"], "skipped_no_spaces")
        self.assertEqual(result["unassigned_households"], ["TEST-A"])

    def test_categories_and_identifier_types_are_validated(self):
        for category, spaces in [
            ("bicycle_large", ["小39"]), ("bicycle_small", ["大1"]),
            ("bicycle_large", ["大39"]), ("bicycle_small", ["小58"]),
            ("motorcycle", [151]),
        ]:
            with self.subTest(category=category, spaces=spaces), self.assertRaises(ValueError):
                draw(category, ["TEST-A"], spaces)

    def test_duplicates_and_assigned_vacant_overlap_are_rejected(self):
        with self.assertRaises(ValueError):
            draw("bicycle_large", ["TEST-A", "TEST-A"], ["大1"])
        with self.assertRaises(ValueError):
            draw("bicycle_large", ["TEST-A"], ["大1", "大1"])
        with self.assertRaises(ValueError):
            prepare("bicycle_large", [], [{"household": "TEST-A", "space": "大1", "paid": True}], ["大1"], True)

    def test_oversubscribed_draw_is_one_to_one_without_mutating_inputs(self):
        participants = ["TEST-A", "TEST-B", "TEST-C"]
        spaces = ["大1", "大2"]
        result = draw("bicycle_large", participants, spaces)
        self.assertEqual(len(result["assignments"]), 2)
        self.assertEqual(len(result["unassigned_households"]), 1)
        allocated = [a["household"] for a in result["assignments"]]
        self.assertEqual(set(allocated + result["unassigned_households"]), set(participants))
        self.assertEqual({a["space"] for a in result["assignments"]}, set(spaces))
        self.assertEqual(participants, ["TEST-A", "TEST-B", "TEST-C"])
        self.assertEqual(spaces, ["大1", "大2"])


if __name__ == "__main__":
    unittest.main()
