#!/usr/bin/env python3
"""Unit tests for the RassyMind appstore contract validator."""

from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


VALIDATOR = Path(__file__).with_name("validate-rassymind-apps.py")


def load_validator():
    spec = importlib.util.spec_from_file_location("validate_rassymind_apps", VALIDATOR)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class ValidatorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def add_app(self, name: str, *, key: str = "RASSYMIND_API_KEY") -> Path:
        app = self.root / name
        app.mkdir()
        (app / "config.json").write_text(
            json.dumps({"form_fields": [{"env_variable": key}]}), encoding="utf-8"
        )
        (app / "docker-compose.yml").write_text(
            "services:\n  app:\n    environment:\n"
            "      RASSYMIND_API_BASE: ${RASSYMIND_API_BASE:-http://host.docker.internal:8844/v1}\n"
            "      RASSYMIND_MODEL: ${RASSYMIND_MODEL:-rassy-smart}\n",
            encoding="utf-8",
        )
        return app

    def test_accepts_canonical_and_app_prefixed_keys(self) -> None:
        validator = load_validator()
        self.add_app("web-one")
        self.add_app("learning-airflow", key="AIRFLOW_RASSYMIND_API_KEY")

        self.assertEqual([], validator.validate_root(self.root))

    def test_reports_retired_names_with_relative_location(self) -> None:
        validator = load_validator()
        app = self.add_app("web-one")
        (app / "active.py").write_text("endpoint = 'RASSYCODEX_API_BASE'\n", encoding="utf-8")

        errors = validator.validate_root(self.root)

        self.assertTrue(
            any("web-one/active.py:1" in error and "RASSYCODEX" in error for error in errors),
            errors,
        )

    def test_ignores_generated_and_historical_content(self) -> None:
        validator = load_validator()
        app = self.add_app("web-one")
        for directory in ("node_modules", "dist", ".git", "historical", "superpowers"):
            ignored = app / directory
            ignored.mkdir()
            (ignored / "legacy.txt").write_text("RASSYGPT rassy-general", encoding="utf-8")
        (app / "package-lock.json").write_text('"RASSYCODEX"', encoding="utf-8")

        self.assertEqual([], validator.validate_root(self.root))

    def test_reports_missing_key_gateway_and_disallowed_alias(self) -> None:
        validator = load_validator()
        app = self.add_app("web-one", key="OTHER_API_KEY")
        (app / "docker-compose.yml").write_text(
            "services:\n  app:\n    environment:\n      MODEL: rassy-general\n",
            encoding="utf-8",
        )

        errors = validator.validate_root(self.root)

        self.assertTrue(any("RASSYMIND_API_KEY" in error for error in errors), errors)
        self.assertTrue(any("host.docker.internal:8844" in error for error in errors), errors)
        self.assertTrue(any("rassy-general" in error for error in errors), errors)

    def test_reports_quoted_disallowed_alias_without_model_context(self) -> None:
        validator = load_validator()
        app = self.add_app("web-one")
        (app / "aliases.ts").write_text(
            'const alias = "rassy-general";\n', encoding="utf-8"
        )

        errors = validator.validate_root(self.root)

        self.assertTrue(any("aliases.ts:1" in error and "rassy-general" in error for error in errors), errors)

    def test_reports_known_predecessor_aliases_without_model_context(self) -> None:
        validator = load_validator()
        app = self.add_app("web-one")
        retired = (
            "rassy-general",
            "rassy-codex",
            "rassy-codex-lite",
            "rassy-agent",
            "rassy-worker",
            "rassy-worker-code",
            "rassy-summarizer",
        )
        (app / "settings.md").write_text(
            "Legacy values: " + ", ".join(f"`{alias}`" for alias in retired) + "\n",
            encoding="utf-8",
        )

        errors = validator.validate_root(self.root)

        for alias in retired:
            self.assertTrue(any(alias in error for error in errors), (alias, errors))

    def test_ignores_non_model_rassy_identifiers(self) -> None:
        validator = load_validator()
        app = self.add_app("web-one")
        (app / "identifiers.ts").write_text(
            'const product = "rassy-app";\n'
            'const service = "rassy-online-web";\n'
            'const cssClass = "rassy-wave-primary";\n'
            'const transition = "rassy-produced-transitions";\n'
            'const header = "x-rassy-model";\n'
            'const storageKey = "mr-rassy-radio-chat-client-id";\n',
            encoding="utf-8",
        )

        self.assertEqual([], validator.validate_root(self.root))

    def test_reports_unknown_alias_in_model_context(self) -> None:
        validator = load_validator()
        app = self.add_app("web-one")
        (app / "settings.ts").write_text(
            'const configuredModel = "rassy-obsolete";\n', encoding="utf-8"
        )

        errors = validator.validate_root(self.root)

        self.assertTrue(any("rassy-obsolete" in error for error in errors), errors)

    def test_rejects_gateway_host_found_only_in_a_comment(self) -> None:
        validator = load_validator()
        app = self.add_app("web-one")
        (app / "docker-compose.yml").write_text(
            "services:\n  app:\n    environment:\n"
            "      # expected host is host.docker.internal:8844\n"
            "      RASSYMIND_API_BASE: ${RASSYMIND_API_BASE:-http://wrong-host:8844/v1}\n",
            encoding="utf-8",
        )

        errors = validator.validate_root(self.root)

        self.assertTrue(any("must default its gateway" in error for error in errors), errors)

    def test_does_not_treat_supporting_learning_apps_as_direct_consumers(self) -> None:
        validator = load_validator()
        for name in ("learning-minio", "learning-qdrant"):
            app = self.root / name
            app.mkdir()
            (app / "config.json").write_text("{}", encoding="utf-8")
            (app / "docker-compose.yml").write_text("services: {}\n", encoding="utf-8")

        self.assertEqual([], validator.validate_root(self.root))


if __name__ == "__main__":
    unittest.main()
