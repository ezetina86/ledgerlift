package main

import (
	"database/sql"
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strings"
)

//go:embed static
var staticFiles embed.FS

func main() {
	port   := flag.String("port", envOr("PORT", "8080"), "listen port")
	dbPath := flag.String("db", envOr("DB_PATH", "ledgerlift.db"), "SQLite file path")
	flag.Parse()

	db := initDB(*dbPath)
	defer db.Close()

	mux := http.NewServeMux()

	// API routes
	mux.HandleFunc("GET /api/health", handleHealth)
	mux.HandleFunc("POST /api/sync",  makeSync(db))

	// SPA static files — serve embedded frontend/dist
	mux.HandleFunc("/", makeSPA())

	handler := corsMiddleware(mux)

	addr := fmt.Sprintf(":%s", *port)
	log.Printf("LedgerLift listening on %s  db=%s", addr, *dbPath)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatal(err)
	}
}

// makeSPA serves the embedded static directory and falls back to index.html
// for any path not matching a real file (client-side routing).
func makeSPA() http.HandlerFunc {
	sub, err := fs.Sub(staticFiles, "static")
	if err != nil {
		log.Fatalf("embed sub: %v", err)
	}
	fileServer := http.FileServer(http.FS(sub))

	return func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}
		// Check if the file exists; fall back to index.html for SPA routes
		f, err := sub.Open(path)
		if err != nil {
			r2 := r.Clone(r.Context())
			r2.URL.Path = "/"
			fileServer.ServeHTTP(w, r2)
			return
		}
		f.Close()
		fileServer.ServeHTTP(w, r)
	}
}

// ── Health ────────────────────────────────────────────────────────────────────

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ── Sync ──────────────────────────────────────────────────────────────────────

func makeSync(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req SyncRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}

		now := nowMs()

		for _, routine := range req.Routines {
			if routine.UpdatedAt == 0 {
				routine.UpdatedAt = now
			}
			if err := upsertRoutine(db, routine); err != nil {
				log.Printf("upsert routine %s: %v", routine.ID, err)
			}
		}
		for _, s := range req.Sessions {
			if s.UpdatedAt == 0 {
				s.UpdatedAt = now
			}
			if err := upsertSession(db, s); err != nil {
				log.Printf("upsert session %s: %v", s.ID, err)
			}
		}
		for _, s := range req.Sets {
			if s.UpdatedAt == 0 {
				s.UpdatedAt = now
			}
			if err := upsertSet(db, s); err != nil {
				log.Printf("upsert set %s: %v", s.ID, err)
			}
		}

		routines, err := fetchRoutinesSince(db, req.LastSyncAt)
		if err != nil {
			log.Printf("fetch routines: %v", err)
		}
		sessions, err := fetchSessionsSince(db, req.LastSyncAt)
		if err != nil {
			log.Printf("fetch sessions: %v", err)
		}
		sets, err := fetchSetsSince(db, req.LastSyncAt)
		if err != nil {
			log.Printf("fetch sets: %v", err)
		}

		if routines == nil { routines = []Routine{} }
		if sessions == nil { sessions = []WorkoutSession{} }
		if sets == nil     { sets = []SetLog{} }

		writeJSON(w, http.StatusOK, SyncResponse{
			SyncedAt: now,
			Routines: routines,
			Sessions: sessions,
			Sets:     sets,
		})
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
