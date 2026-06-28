from pathlib import Path


ROOT = Path(__file__).resolve().parents[1] / "apps"
UMAMI_SCRIPT_URL = "https://umami.rasies.com/script.js"


FRONTEND_ENTRIES = [
    Path("web-astro/repo/apps/web-jupiterseek/app/layout.tsx"),
    Path("web-astro/repo/apps/web-maleficme/app/layout.tsx"),
    Path("web-astro/repo/apps/web-oracleveil/app/layout.tsx"),
    Path("web-astro/repo/apps/web-saturnleo/app/layout.tsx"),
    Path("web-astro/repo/apps/web-saturnseer/app/layout.tsx"),
    Path("web-bat/apps/web/app/layout.tsx"),
    Path("web-crackstack/repo/web/apps/xlcrack/app/layout.tsx"),
    Path("web-crackstack/repo/web/apps/tapecrack/app/layout.tsx"),
    Path("web-jogmania/repo/repo/apps/web/src/app/layout.tsx"),
    Path("web-lickingvape/repo/apps/web/app/layout.tsx"),
    Path("web-rasies/web/index.html"),
    Path("web-rassyapp/repo/app/layout.tsx"),
    Path("web-rassys/apps/web/src/app/layout.tsx"),
    Path("web-totallyrighteoustales/repo/apps/web/app/layout.tsx"),
    Path("web-usmender/repo/apps/web/src/app/layout.tsx"),
]


COMPOSE_EXPECTATIONS = {
    Path("web-astro/docker-compose.yml"): [
        "ASTRO_JUPITERSEEK_UMAMI_WEBSITE_ID",
        "ASTRO_MALEFICME_UMAMI_WEBSITE_ID",
        "ASTRO_ORACLEVEIL_UMAMI_WEBSITE_ID",
        "ASTRO_SATURNLEO_UMAMI_WEBSITE_ID",
        "ASTRO_SATURNSEER_UMAMI_WEBSITE_ID",
    ],
    Path("web-bat/docker-compose.yml"): ["WEB_BAT_UMAMI_WEBSITE_ID"],
    Path("web-crackstack/docker-compose.yml"): [
        "CRACKSTACK_XLCRACK_UMAMI_WEBSITE_ID",
        "CRACKSTACK_TAPECRACK_UMAMI_WEBSITE_ID",
    ],
    Path("web-jogmania/docker-compose.yml"): ["JOGMANIA_UMAMI_WEBSITE_ID"],
    Path("web-lickingvape/docker-compose.yml"): ["LICKINGVAPE_UMAMI_WEBSITE_ID"],
    Path("web-rasies/docker-compose.yml"): ["RASIES_UMAMI_WEBSITE_ID"],
    Path("web-rassyapp/docker-compose.yml"): ["RASSYAPP_UMAMI_WEBSITE_ID"],
    Path("web-rassys/docker-compose.yml"): ["RASSYS_UMAMI_WEBSITE_ID"],
    Path("web-totallyrighteoustales/docker-compose.yml"): ["TRT_UMAMI_WEBSITE_ID"],
    Path("web-usmender/docker-compose.yml"): ["USMENDER_UMAMI_WEBSITE_ID"],
}


def read(relative_path: Path) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def test_every_web_frontend_has_umami_tracking_hook():
    missing = []
    for entry in FRONTEND_ENTRIES:
        source = read(entry)
        if UMAMI_SCRIPT_URL not in source or "data-website-id" not in source:
            missing.append(str(entry))

    assert not missing, "missing Umami tracking hook in:\n" + "\n".join(missing)


def test_web_compose_files_expose_umami_website_ids():
    missing = []
    for compose_file, expected_vars in COMPOSE_EXPECTATIONS.items():
        source = read(compose_file)
        for expected_var in expected_vars:
            if expected_var not in source:
                missing.append(f"{compose_file}: {expected_var}")

    assert not missing, "missing Umami compose env vars:\n" + "\n".join(missing)
