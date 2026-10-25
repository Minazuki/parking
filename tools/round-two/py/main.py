#!/usr/bin/env python3
"""Review payments and draw a second round from explicitly confirmed inputs."""

import argparse
import json
import random
from pathlib import Path


CATEGORIES = {"motorcycle", "bicycle_large", "bicycle_small"}


def identifiers(values, label):
    if not isinstance(values, list) or any(
        not isinstance(value, str) or not value or value != value.strip()
        for value in values
    ):
        raise ValueError(f"{label} must contain nonempty text identifiers")
    if len(set(values)) != len(values):
        raise ValueError(f"{label} contains duplicate identifiers")
    return list(values)


def validate_category(category):
    if category not in CATEGORIES:
        raise ValueError("Unknown vehicle category")


def validate_spaces(category, spaces):
    import re

    patterns = {
        "motorcycle": r"(?:[1-9][0-9]?|1[0-4][0-9]|150|(?:14|2|3)-1)",
        "bicycle_large": r"大(?:[1-9]|[12][0-9]|3[0-8])",
        "bicycle_small": r"小(?:39|4[0-9]|5[0-7])",
    }
    if any(re.fullmatch(patterns[category], space) is None for space in spaces):
        raise ValueError("Space does not belong to the selected vehicle category")


def prepare(category, participants, allocations, vacant_spaces, review_confirmed):
    """Participants must already have round-two intent and confirmed eligibility."""
    validate_category(category)
    if review_confirmed is not True:
        raise ValueError("Confirm the payment deadline and review before releasing spaces")
    participants = identifiers(participants, "participants")
    vacant_spaces = identifiers(vacant_spaces, "vacant_spaces")
    if not isinstance(allocations, list) or any(not isinstance(a, dict) for a in allocations):
        raise ValueError("allocations must be a list of records")
    assigned = identifiers([a.get("space") for a in allocations], "allocated spaces")
    identifiers([a.get("household") for a in allocations], "allocated households")
    validate_spaces(category, assigned + vacant_spaces)
    if set(assigned) & set(vacant_spaces):
        raise ValueError("An allocated space cannot also be vacant")
    if any(type(a.get("paid")) is not bool for a in allocations):
        raise ValueError("Each allocation requires an explicitly confirmed paid boolean")
    released = [
        {"household": a["household"], "space": a["space"], "reason": "unpaid_after_deadline"}
        for a in allocations if not a["paid"]
    ]
    available = vacant_spaces + [a["space"] for a in released]
    status = (
        "skipped_no_participants" if not participants
        else "skipped_no_spaces" if not available
        else "ready"
    )
    return {
        "category": category,
        "round": 2,
        "status": status,
        "participants": participants,
        "available_spaces": available,
        "released_allocations": released,
    }


def draw(category, participants, available_spaces):
    validate_category(category)
    participants = identifiers(participants, "participants")
    spaces = identifiers(available_spaces, "available_spaces")
    validate_spaces(category, spaces)
    status = (
        "skipped_no_participants" if not participants
        else "skipped_no_spaces" if not spaces
        else "completed"
    )
    if status == "completed":
        rng = random.SystemRandom()
        rng.shuffle(participants)
        rng.shuffle(spaces)
    count = min(len(participants), len(spaces)) if status == "completed" else 0
    return {
        "category": category,
        "round": 2,
        "status": status,
        "assignments": [
            {"household": household, "space": space}
            for household, space in zip(participants[:count], spaces[:count])
        ],
        "unassigned_households": participants[count:],
        "remaining_spaces": spaces[count:],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["prepare", "draw"])
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        payload = json.loads(args.input.read_text(encoding="utf-8"))
        if args.operation == "prepare":
            result = prepare(
                payload["category"], payload["participants"], payload["allocations"],
                payload["vacant_spaces"], payload.get("review_confirmed"),
            )
        else:
            # Use a reviewed preparation output, not unconfirmed payment records.
            expected = (
                "skipped_no_participants" if not payload["participants"]
                else "skipped_no_spaces" if not payload["available_spaces"] else "ready"
            )
            if payload.get("round") != 2 or payload.get("status") != expected:
                raise ValueError("Draw requires a valid round-two preparation output")
            result = draw(payload["category"], payload["participants"], payload["available_spaces"])
        serialized = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
        args.output.parent.mkdir(parents=True, exist_ok=True)
        # An existing result is never overwritten or silently redrawn in place.
        with args.output.open("x", encoding="utf-8") as stream:
            stream.write(serialized)
    except (ValueError, KeyError, TypeError, OSError) as error:
        parser.exit(1, f"Error: {error}\n")


if __name__ == "__main__":
    main()
