.PHONY: test build qualify compose-config

test:
	GOCACHE=/tmp/web-bat-go-cache pytest -q apps/api/src/tests
	npm test --prefix apps/mastra

build:
	npm run build --prefix apps/mastra
	npm run build --prefix apps/web

compose-config:
	docker compose config --quiet

qualify: test build compose-config
