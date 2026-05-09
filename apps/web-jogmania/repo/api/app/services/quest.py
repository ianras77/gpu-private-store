from datetime import date
import random

QUESTS = [
    ("Relic Rush", "Collect 12 relics before mile 1.0", "Neon Anklet +15 XP"),
    ("Temple Sprint", "Clear 3 log jumps in a row", "CRT Spark Band"),
    ("Jungle Tempo", "Hold pace above 4.0x for 45s", "Turbo Sweatband"),
    ("Vine Vault", "Chain 5 jumps without a miss", "Vine Runner Patch"),
    ("Glow Streak", "Keep streak alive for 8 relics", "Photon Charm")
]


def generate_daily_quest(today: date | None = None):
    today = today or date.today()
    seed = int(today.strftime("%Y%m%d"))
    rng = random.Random(seed)
    title, goal, reward = rng.choice(QUESTS)
    return {
        "title": title,
        "goal": goal,
        "reward": reward,
        "seed": seed,
        "expires": today.isoformat()
    }
