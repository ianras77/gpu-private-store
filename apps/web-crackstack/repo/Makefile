.PHONY: up down logs test lint

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f --tail=100

test:
	$(MAKE) -C backend test

lint:
	$(MAKE) -C backend lint
