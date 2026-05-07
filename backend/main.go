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
	sub, err := fs.Sub(staticFiles, "static")
	if err != nil {
		log.Fatalf("embed sub: %v", err)
	}
	mux.HandleFunc("/", makeSPA(sub))

	handler := corsMiddleware(mux)

	addr := fmt.Sprintf(":%s", *port)
	log.Printf("LedgerLift listening on %s  db=%s", addr, *dbPath)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatal(err)
	}
}

// makeSPA serves the given fs.FS and falls back to index.html
// for any path not matching a real file (client-side routing).
func makeSPA(fsys fs.FS) http.HandlerFunc {
	fileServer := http.FileServer(http.FS(fsys))

	return func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}
		// Check if the file exists; fall back to index.html for SPA routes
		f, err := fsys.Open(path)
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

func makeSync(db *sql.DB, nowFn ...func() int64) http.HandlerFunc {
	clock := nowMs
	if len(nowFn) > 0 && nowFn[0] != nil {
		clock = nowFn[0]
	}
	return func(w http.ResponseWriter, r *http.Request) {
		var req SyncRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}

		now := clock()

		for _, routine := range req.Routines {
			if err := upsertRoutine(db, routine, now); err != nil {
				log.Printf("upsert routine %s: %v", routine.ID, err)
			}
		}
		for _, s := range req.Sessions {
			if err := upsertSession(db, s, now); err != nil {
				log.Printf("upsert session %s: %v", s.ID, err)
			}
		}
		for _, s := range req.Sets {
			if err := upsertSet(db, s, now); err != nil {
				log.Printf("upsert set %s: %v", s.ID, err)
			}
		}
		for _, m := range req.Mesocycles {
			if err := upsertMesocycle(db, m, now); err != nil {
				log.Printf("upsert mesocycle %s: %v", m.ID, err)
			}
		}
		for _, sw := range req.ExerciseSwaps {
			if err := upsertExerciseSwap(db, sw); err != nil {
				log.Printf("upsert exercise_swap %s: %v", sw.ID, err)
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
		mesocycles, err := fetchMesocyclesSince(db, req.LastSyncAt)
		if err != nil {
			log.Printf("fetch mesocycles: %v", err)
		}
		exerciseSwaps, err := fetchExerciseSwapsSince(db, req.LastSyncAt)
		if err != nil {
			log.Printf("fetch exercise_swaps: %v", err)
		}

		if routines == nil      { routines = []Routine{} }
		if sessions == nil      { sessions = []WorkoutSession{} }
		if sets == nil          { sets = []SetLog{} }
		if mesocycles == nil    { mesocycles = []Mesocycle{} }
		if exerciseSwaps == nil { exerciseSwaps = []ExerciseSwap{} }

		writeJSON(w, http.StatusOK, SyncResponse{
			SyncedAt:      now,
			Routines:      routines,
			Sessions:      sessions,
			Sets:          sets,
			Mesocycles:    mesocycles,
			ExerciseSwaps: exerciseSwaps,
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
