import random

LOOT_TABLE = {
    "common": [
        ("Static Charm", "Keeps the CRT humming."),
        ("Jungle Patch", "Rough fabric from the canopy."),
        ("Pace Badge", "Proof of steady tempo.")
    ],
    "rare": [
        ("Neon Anklet", "Crackles with 80s electricity."),
        ("Vine Runner Patch", "Grants extra airtime."),
        ("Turbo Sweatband", "Feels like a power-up.")
    ],
    "epic": [
        ("Prism Relic", "Splits light into speed boosts."),
        ("CRT Crown", "Arcade royalty status."),
        ("Sunflare Totem", "Burns away fatigue.")
    ]
}


def roll_loot(distance_m: float, duration_s: int, avg_pace_s_per_km: int) -> list[dict]:
    score = distance_m / 200 + max(0, 600 - avg_pace_s_per_km) / 200
    rng = random.Random(f"{distance_m}-{duration_s}-{avg_pace_s_per_km}")

    rolls = 1 + (1 if score > 5 else 0) + (1 if score > 9 else 0)
    items: list[dict] = []

    for _ in range(rolls):
        rarity = "common"
        if score > 8 and rng.random() > 0.6:
            rarity = "epic"
        elif score > 4 and rng.random() > 0.5:
            rarity = "rare"

        name, description = rng.choice(LOOT_TABLE[rarity])
        items.append({"name": name, "rarity": rarity, "description": description})

    return items
