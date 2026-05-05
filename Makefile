BUN     := $(HOME)/.bun/bin/bun
GO      := go
DC      := docker compose
VERSION := $(shell cat VERSION)
IMAGE   := ezetina86/ledgerlift

.PHONY: dev dev-frontend dev-backend build build-frontend build-backend \
        docker deploy pull pull-dev logs backup restore catalog clean help \
        test test-frontend test-backend lint ci \
        version bump-patch bump-minor bump-major tag release

# ── Development ───────────────────────────────────────────────────────────────

dev: ## Start frontend dev server + backend in parallel
	@$(MAKE) -j2 dev-frontend dev-backend

dev-frontend:
	cd frontend && $(BUN) run dev --host

dev-backend:
	cd backend && $(GO) run . -db ledgerlift.db

# ── Build ─────────────────────────────────────────────────────────────────────

build: build-frontend build-backend ## Full local build (frontend → embedded binary)

build-frontend:
	cd frontend && $(BUN) run build

build-backend: build-frontend
	cp -r frontend/dist backend/static
	cd backend && $(GO) build -ldflags="-s -w" -o ledgerlift .

# ── Docker / Deploy ───────────────────────────────────────────────────────────

docker: ## Build Docker image
	$(DC) build --no-cache

deploy: ## Build + restart container (home lab)
	$(DC) up -d --build

pull: ## Pull latest prod image from Docker Hub and restart (no local build)
	TAG=latest $(DC) pull
	TAG=latest $(DC) up -d

pull-dev: ## Pull latest dev image from Docker Hub and restart
	TAG=dev-latest $(DC) pull
	TAG=dev-latest $(DC) up -d

stop:
	$(DC) down

restart:
	$(DC) restart ledgerlift

logs: ## Tail container logs
	$(DC) logs -f ledgerlift

# ── Data ──────────────────────────────────────────────────────────────────────

backup: ## Backup SQLite from Docker volume to ./backups/
	@mkdir -p backups
	$(eval TS := $(shell date +%Y%m%d_%H%M%S))
	docker cp ledgerlift:/data/ledgerlift.db backups/ledgerlift_$(TS).db
	@echo "Backed up → backups/ledgerlift_$(TS).db"

restore: ## Restore latest backup into Docker volume (DESTRUCTIVE)
	$(eval LATEST := $(shell ls -t backups/*.db 2>/dev/null | head -1))
	@if [ -z "$(LATEST)" ]; then echo "No backup found in ./backups/"; exit 1; fi
	@echo "WARNING: This will replace the live database with $(LATEST)"
	@read -p "Continue? [y/N] " yn; [ "$$yn" = "y" ] || exit 1
	$(DC) stop ledgerlift
	docker cp $(LATEST) ledgerlift:/data/ledgerlift.db
	$(DC) start ledgerlift
	@echo "Restored $(LATEST)"

catalog: ## Re-export exercise catalog from xlsx → exercises.json
	.venv/bin/python scripts/parse_catalog.py

# ── Testing ────────────────────────────────────────────────────────────────

test: test-frontend test-backend ## Run all tests (frontend + backend)

test-frontend: ## Run frontend Vitest suite
	cd frontend && $(BUN) run test

test-backend: ## Run backend Go tests
	cd backend && CGO_ENABLED=0 $(GO) test -v ./...

# ── Linting ────────────────────────────────────────────────────────────────

lint: ## Lint + type-check frontend and vet backend
	cd frontend && $(BUN) run tsc --noEmit
	cd frontend && $(BUN) run lint
	cd backend && $(GO) vet ./...

# ── CI simulation ─────────────────────────────────────────────────────────

ci: lint test build ## Full local CI simulation (lint → test → build)
	@echo ""
	@echo "CI simulation complete — all checks passed."

# ── Misc ──────────────────────────────────────────────────────────────────────

clean:
	rm -f backend/ledgerlift backend/ledgerlift.db
	rm -rf frontend/dist backend/static
	cp -n /dev/null backend/static/index.html 2>/dev/null || true

# ── Versioning ────────────────────────────────────────────────────────────────

version: ## Show current version
	@echo "$(VERSION)"

bump-patch: ## Bump patch version (0.0.X)
	@NEW=$$(echo "$(VERSION)" | awk -F. '{print $$1"."$$2"."$$3+1}'); \
	echo $$NEW > VERSION; \
	echo "Bumped → $$NEW"

bump-minor: ## Bump minor version (0.X.0)
	@NEW=$$(echo "$(VERSION)" | awk -F. '{print $$1"."$$2+1".0"}'); \
	echo $$NEW > VERSION; \
	echo "Bumped → $$NEW"

bump-major: ## Bump major version (X.0.0)
	@NEW=$$(echo "$(VERSION)" | awk -F. '{print $$1+1".0.0"}'); \
	echo $$NEW > VERSION; \
	echo "Bumped → $$NEW"

tag: ## Create and push git tag for current VERSION (e.g. v0.6.0)
	@echo "Tagging v$(VERSION)"
	git tag -a "v$(VERSION)" -m "Release v$(VERSION)"
	git push origin "v$(VERSION)"

release: bump-patch tag ## Bump patch + tag + push (quick release shortcut)

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*##"}{printf "  \033[36m%-16s\033[0m %s\n",$$1,$$2}'
