package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"time"

	_ "modernc.org/sqlite"
)

func initDB(path string) *sql.DB {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	db.SetMaxOpenConns(1) // SQLite single-writer

	if _, err = db.Exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;`); err != nil {
		log.Fatalf("pragma: %v", err)
	}

	schema := `
	CREATE TABLE IF NOT EXISTS routines (
		id          TEXT PRIMARY KEY,
		name        TEXT NOT NULL,
		split_day   TEXT NOT NULL,
		exercises   TEXT NOT NULL DEFAULT '[]',
		created_at  INTEGER NOT NULL,
		updated_at  INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS sessions (
		id            TEXT PRIMARY KEY,
		routine_id    TEXT NOT NULL,
		routine_name  TEXT NOT NULL,
		split_day     TEXT NOT NULL,
		started_at    INTEGER NOT NULL,
		completed_at  INTEGER,
		notes         TEXT NOT NULL DEFAULT '',
		updated_at    INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS sets (
		id            TEXT PRIMARY KEY,
		session_id    TEXT NOT NULL REFERENCES sessions(id),
		exercise_id   TEXT NOT NULL,
		exercise_name TEXT NOT NULL,
		set_number    INTEGER NOT NULL,
		reps          INTEGER NOT NULL,
		weight_kg     REAL NOT NULL,
		rpe           REAL,
		volume        REAL NOT NULL,
		timestamp     INTEGER NOT NULL,
		updated_at    INTEGER NOT NULL
	);

	CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at);
	CREATE INDEX IF NOT EXISTS idx_sets_updated     ON sets(updated_at);
	CREATE INDEX IF NOT EXISTS idx_sets_session     ON sets(session_id);
	`
	if _, err = db.Exec(schema); err != nil {
		log.Fatalf("schema: %v", err)
	}
	return db
}

// ── Upsert helpers ────────────────────────────────────────────────────────────

func upsertRoutine(db *sql.DB, r Routine) error {
	exJSON, _ := json.Marshal(r.Exercises)
	_, err := db.Exec(`
		INSERT INTO routines(id,name,split_day,exercises,created_at,updated_at)
		VALUES(?,?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET
			name=excluded.name, split_day=excluded.split_day,
			exercises=excluded.exercises, updated_at=excluded.updated_at
		WHERE excluded.updated_at > routines.updated_at`,
		r.ID, r.Name, r.SplitDay, string(exJSON), r.CreatedAt, r.UpdatedAt,
	)
	return err
}

func upsertSession(db *sql.DB, s WorkoutSession) error {
	_, err := db.Exec(`
		INSERT INTO sessions(id,routine_id,routine_name,split_day,started_at,completed_at,notes,updated_at)
		VALUES(?,?,?,?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET
			completed_at=excluded.completed_at, notes=excluded.notes,
			updated_at=excluded.updated_at
		WHERE excluded.updated_at > sessions.updated_at`,
		s.ID, s.RoutineID, s.RoutineName, s.SplitDay,
		s.StartedAt, s.CompletedAt, s.Notes, s.UpdatedAt,
	)
	return err
}

func upsertSet(db *sql.DB, s SetLog) error {
	_, err := db.Exec(`
		INSERT INTO sets(id,session_id,exercise_id,exercise_name,set_number,reps,weight_kg,rpe,volume,timestamp,updated_at)
		VALUES(?,?,?,?,?,?,?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET
			reps=excluded.reps, weight_kg=excluded.weight_kg, rpe=excluded.rpe,
			volume=excluded.volume, updated_at=excluded.updated_at
		WHERE excluded.updated_at > sets.updated_at`,
		s.ID, s.SessionID, s.ExerciseID, s.ExerciseName,
		s.SetNumber, s.Reps, s.WeightKg, s.RPE, s.Volume, s.Timestamp, s.UpdatedAt,
	)
	return err
}

// ── Fetch since ───────────────────────────────────────────────────────────────

func fetchRoutinesSince(db *sql.DB, since int64) ([]Routine, error) {
	rows, err := db.Query(`SELECT id,name,split_day,exercises,created_at,updated_at FROM routines WHERE updated_at > ?`, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Routine
	for rows.Next() {
		var r Routine
		var exJSON string
		if err := rows.Scan(&r.ID, &r.Name, &r.SplitDay, &exJSON, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(exJSON), &r.Exercises)
		out = append(out, r)
	}
	return out, rows.Err()
}

func fetchSessionsSince(db *sql.DB, since int64) ([]WorkoutSession, error) {
	rows, err := db.Query(`SELECT id,routine_id,routine_name,split_day,started_at,completed_at,notes,updated_at FROM sessions WHERE updated_at > ?`, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []WorkoutSession
	for rows.Next() {
		var s WorkoutSession
		if err := rows.Scan(&s.ID, &s.RoutineID, &s.RoutineName, &s.SplitDay, &s.StartedAt, &s.CompletedAt, &s.Notes, &s.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func fetchSetsSince(db *sql.DB, since int64) ([]SetLog, error) {
	rows, err := db.Query(`SELECT id,session_id,exercise_id,exercise_name,set_number,reps,weight_kg,rpe,volume,timestamp,updated_at FROM sets WHERE updated_at > ?`, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []SetLog
	for rows.Next() {
		var s SetLog
		if err := rows.Scan(&s.ID, &s.SessionID, &s.ExerciseID, &s.ExerciseName, &s.SetNumber, &s.Reps, &s.WeightKg, &s.RPE, &s.Volume, &s.Timestamp, &s.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func nowMs() int64 { return time.Now().UnixMilli() }
