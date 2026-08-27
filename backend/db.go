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
		mesocycle_id  TEXT,
		is_deload     INTEGER NOT NULL DEFAULT 0,
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

	CREATE TABLE IF NOT EXISTS mesocycles (
		id             TEXT PRIMARY KEY,
		number         INTEGER NOT NULL,
		name           TEXT NOT NULL,
		target_weeks   INTEGER NOT NULL DEFAULT 5,
		started_at     INTEGER NOT NULL,
		ended_at       INTEGER,
		is_deload_week INTEGER NOT NULL DEFAULT 0,
		updated_at     INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS exercise_swaps (
		id                  TEXT PRIMARY KEY,
		mesocycle_id        TEXT NOT NULL,
		routine_id          TEXT NOT NULL,
		removed_exercise_id TEXT NOT NULL,
		added_exercise_id   TEXT NOT NULL,
		swapped_at          INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS run_sessions (
		id           TEXT PRIMARY KEY,
		week         INTEGER NOT NULL,
		day          INTEGER NOT NULL,
		started_at   INTEGER NOT NULL,
		completed_at INTEGER,
		duration_sec INTEGER,
		distance_km  REAL,
		rpe          REAL,
		updated_at   INTEGER NOT NULL
	);

	CREATE INDEX IF NOT EXISTS idx_sessions_updated     ON sessions(updated_at);
	CREATE INDEX IF NOT EXISTS idx_sets_updated         ON sets(updated_at);
	CREATE INDEX IF NOT EXISTS idx_sets_session         ON sets(session_id);
	CREATE INDEX IF NOT EXISTS idx_mesos_updated        ON mesocycles(updated_at);
	CREATE INDEX IF NOT EXISTS idx_swaps_mesocycle      ON exercise_swaps(mesocycle_id);
	CREATE INDEX IF NOT EXISTS idx_run_sessions_updated ON run_sessions(updated_at);
	`
	if _, err = db.Exec(schema); err != nil {
		log.Fatalf("schema: %v", err)
	}
	return db
}

// ── Upsert helpers ────────────────────────────────────────────────────────────

// upsertRoutine writes r to DB. serverNow ensures pushed records are always
// visible to subsequent delta fetches (updated_at >= server receipt time).
func upsertRoutine(db *sql.DB, r Routine, serverNow int64) error {
	exJSON, _ := json.Marshal(r.Exercises)
	effectiveUpdatedAt := max(r.UpdatedAt, serverNow)
	_, err := db.Exec(`
		INSERT INTO routines(id,name,split_day,exercises,created_at,updated_at)
		VALUES(?,?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET
			name=excluded.name, split_day=excluded.split_day,
			exercises=excluded.exercises, updated_at=excluded.updated_at
		WHERE excluded.updated_at > routines.updated_at`,
		r.ID, r.Name, r.SplitDay, string(exJSON), r.CreatedAt, effectiveUpdatedAt,
	)
	return err
}

func upsertSession(db *sql.DB, s WorkoutSession, serverNow int64) error {
	effectiveUpdatedAt := max(s.UpdatedAt, serverNow)
	isDeloadInt := 0
	if s.IsDeload {
		isDeloadInt = 1
	}
	_, err := db.Exec(`
		INSERT INTO sessions(id,routine_id,routine_name,split_day,started_at,completed_at,notes,mesocycle_id,is_deload,updated_at)
		VALUES(?,?,?,?,?,?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET
			completed_at=excluded.completed_at, notes=excluded.notes,
			mesocycle_id=excluded.mesocycle_id, is_deload=excluded.is_deload,
			updated_at=excluded.updated_at
		WHERE excluded.updated_at > sessions.updated_at`,
		s.ID, s.RoutineID, s.RoutineName, s.SplitDay,
		s.StartedAt, s.CompletedAt, s.Notes, s.MesocycleID, isDeloadInt, effectiveUpdatedAt,
	)
	return err
}

func upsertSet(db *sql.DB, s SetLog, serverNow int64) error {
	effectiveUpdatedAt := max(s.UpdatedAt, serverNow)
	_, err := db.Exec(`
		INSERT INTO sets(id,session_id,exercise_id,exercise_name,set_number,reps,weight_kg,rpe,volume,timestamp,updated_at)
		VALUES(?,?,?,?,?,?,?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET
			reps=excluded.reps, weight_kg=excluded.weight_kg, rpe=excluded.rpe,
			volume=excluded.volume, updated_at=excluded.updated_at
		WHERE excluded.updated_at > sets.updated_at`,
		s.ID, s.SessionID, s.ExerciseID, s.ExerciseName,
		s.SetNumber, s.Reps, s.WeightKg, s.RPE, s.Volume, s.Timestamp, effectiveUpdatedAt,
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
	rows, err := db.Query(`SELECT id,routine_id,routine_name,split_day,started_at,completed_at,notes,mesocycle_id,is_deload,updated_at FROM sessions WHERE updated_at > ?`, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []WorkoutSession
	for rows.Next() {
		var s WorkoutSession
		var isDeloadInt int
		if err := rows.Scan(&s.ID, &s.RoutineID, &s.RoutineName, &s.SplitDay, &s.StartedAt, &s.CompletedAt, &s.Notes, &s.MesocycleID, &isDeloadInt, &s.UpdatedAt); err != nil {
			return nil, err
		}
		s.IsDeload = isDeloadInt != 0
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

func upsertMesocycle(db *sql.DB, m Mesocycle, serverNow int64) error {
	effectiveUpdatedAt := max(m.UpdatedAt, serverNow)
	isDeloadInt := 0
	if m.IsDeloadWeek {
		isDeloadInt = 1
	}
	_, err := db.Exec(`
		INSERT INTO mesocycles(id,number,name,target_weeks,started_at,ended_at,is_deload_week,updated_at)
		VALUES(?,?,?,?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET
			name=excluded.name, ended_at=excluded.ended_at,
			is_deload_week=excluded.is_deload_week,
			updated_at=excluded.updated_at
		WHERE excluded.updated_at > mesocycles.updated_at`,
		m.ID, m.Number, m.Name, m.TargetWeeks,
		m.StartedAt, m.EndedAt, isDeloadInt, effectiveUpdatedAt,
	)
	return err
}

func upsertExerciseSwap(db *sql.DB, s ExerciseSwap) error {
	_, err := db.Exec(`
		INSERT OR IGNORE INTO exercise_swaps(id,mesocycle_id,routine_id,removed_exercise_id,added_exercise_id,swapped_at)
		VALUES(?,?,?,?,?,?)`,
		s.ID, s.MesocycleID, s.RoutineID,
		s.RemovedExerciseID, s.AddedExerciseID, s.SwappedAt,
	)
	return err
}

func fetchMesocyclesSince(db *sql.DB, since int64) ([]Mesocycle, error) {
	rows, err := db.Query(`SELECT id,number,name,target_weeks,started_at,ended_at,is_deload_week,updated_at FROM mesocycles WHERE updated_at > ?`, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Mesocycle
	for rows.Next() {
		var m Mesocycle
		var isDeloadInt int
		if err := rows.Scan(&m.ID, &m.Number, &m.Name, &m.TargetWeeks, &m.StartedAt, &m.EndedAt, &isDeloadInt, &m.UpdatedAt); err != nil {
			return nil, err
		}
		m.IsDeloadWeek = isDeloadInt != 0
		out = append(out, m)
	}
	return out, rows.Err()
}

func fetchExerciseSwapsSince(db *sql.DB, since int64) ([]ExerciseSwap, error) {
	rows, err := db.Query(`SELECT id,mesocycle_id,routine_id,removed_exercise_id,added_exercise_id,swapped_at FROM exercise_swaps WHERE swapped_at > ?`, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []ExerciseSwap
	for rows.Next() {
		var s ExerciseSwap
		if err := rows.Scan(&s.ID, &s.MesocycleID, &s.RoutineID, &s.RemovedExerciseID, &s.AddedExerciseID, &s.SwappedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func upsertRunSession(db *sql.DB, rs RunSession, serverNow int64) error {
	effectiveUpdatedAt := max(rs.UpdatedAt, serverNow)
	_, err := db.Exec(`
		INSERT INTO run_sessions(id,week,day,started_at,completed_at,duration_sec,distance_km,rpe,updated_at)
		VALUES(?,?,?,?,?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET
			completed_at=excluded.completed_at, duration_sec=excluded.duration_sec,
			distance_km=excluded.distance_km, rpe=excluded.rpe,
			updated_at=excluded.updated_at
		WHERE excluded.updated_at > run_sessions.updated_at`,
		rs.ID, rs.Week, rs.Day, rs.StartedAt,
		rs.CompletedAt, rs.DurationSec, rs.DistanceKm, rs.RPE,
		effectiveUpdatedAt,
	)
	return err
}

func fetchRunSessionsSince(db *sql.DB, since int64) ([]RunSession, error) {
	rows, err := db.Query(
		`SELECT id,week,day,started_at,completed_at,duration_sec,distance_km,rpe,updated_at FROM run_sessions WHERE updated_at > ?`,
		since,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []RunSession
	for rows.Next() {
		var rs RunSession
		if err := rows.Scan(
			&rs.ID, &rs.Week, &rs.Day, &rs.StartedAt,
			&rs.CompletedAt, &rs.DurationSec, &rs.DistanceKm, &rs.RPE,
			&rs.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, rs)
	}
	return out, rows.Err()
}

func nowMs() int64 { return time.Now().UnixMilli() }
