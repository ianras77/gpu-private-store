import random


WORLD_NAMES = [
    "Fama Reach",
    "Violet Expanse",
    "Citadel of Echoes",
    "Neon Wastes",
    "Glasswild Corridor",
    "Arc Light Frontier"
]

FACTIONS = [
    "Signal Wardens",
    "Chrome Runners",
    "Ghost Caravan",
    "Atlas Forgers",
    "Midnight Cartographers"
]

RELICS = [
    "Arc Prism",
    "Pulse Keystone",
    "Skyline Codex",
    "Dawn Circuit",
    "Rift Compass"
]

ENCOUNTER_VERBS = [
    "dodges",
    "threads through",
    "outruns",
    "deciphers",
    "disarms"
]


def pick_world_name(seed: int) -> str:
    rng = random.Random(seed)
    return rng.choice(WORLD_NAMES)


def pick_faction(seed: int) -> str:
    rng = random.Random(seed + 17)
    return rng.choice(FACTIONS)


def pick_relic(seed: int, index: int = 0) -> str:
    rng = random.Random(seed + index * 7)
    return rng.choice(RELICS)


def pick_verb(seed: int, index: int = 0) -> str:
    rng = random.Random(seed + index * 11)
    return rng.choice(ENCOUNTER_VERBS)
