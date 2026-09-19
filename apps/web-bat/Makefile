.PHONY: test build qualify compose-config

test:
	GOCACHE=/tmp/web-bat-go-cache pytest -q apps/api/src/tests
	npm test --prefix apps/mastra
	cd apps/web && npm run test:ui

build:
	npm run build --prefix apps/mastra
	npm run build --prefix apps/web

compose-config:
	BAT_INTERNAL_SERVICE_TOKEN=$${BAT_INTERNAL_SERVICE_TOKEN:-qualification-token} BAT_POSTGRES_PASSWORD=$${BAT_POSTGRES_PASSWORD:-qualification-password} docker compose config --quiet

qualify: test build compose-config
