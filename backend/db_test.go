package main

import (
	"database/sql"
	"path/filepath"
	"testing"
)

// testDB creates a temporary SQLite database for a test.
// The file is automatically removed when the test ends.
func testDB(t *testing.T) *sql.DB {
	t.Helper()
	db := initDB(filepath.Join(t.TempDir(), "test.db"))
	t.Cleanup(func() { db.Close() })
	return db
}

// ── Schema ────────────────────────────────────────────────────────────────────

func TestInitDB_TablesExist(t *testing.T) {
	db := testDB(t)

	for _, table := range []string{"routines", "sessions", "sets"} {
		var name string
		err := db.QueryRow(
			`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, table,
		).Scan(&name)
		if err != nil {
			t.Errorf("table %q not found: %v", table, err)
		}
	}
}

func TestInitDB_IndexesExist(t *testing.T) {
	db := testDB(t)

	for _, idx := range []string{"idx_sessions_updated", "idx_sets_updated", "idx_sets_session"} {
		var name string
		err := db.QueryRow(
			`SELECT name FROM sqlite_master WHERE type='index' AND name=?`, idx,
		).Scan(&name)
		if err != nil {
			t.Errorf("index %q not found: %v", idx, err)
		}
	}
}

// ── Routines ──────────────────────────────────────────────────────────────────

func TestUpsertRoutine_Insert(t *testing.T) {
	db := testDB(t)

	r := Routine{
		ID: "r-1", Name: "Upper A", SplitDay: "upperA",
		Exercises: []RoutineExercise{
			{ExerciseID: "bench-press", Order: 1, DefaultSets: 3, DefaultReps: "8-12"},
		},
		CreatedAt: 1000, UpdatedAt: 100,
	}
	if err := upsertRoutine(db, r); err != nil {
		t.Fatalf("upsertRoutine: %v", err)
	}

	rows, err := fetchRoutinesSince(db, 0)
	if err != nil {
		t.Fatalf("fetchRoutinesSince: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected 1 routine, got %d", len(rows))
	}
	if rows[0].Name != "Upper A" {
		t.Errorf("expected name 'Upper A', got %q", rows[0].Name)
	}
	if rows[0].SplitDay != "upperA" {
		t.Errorf("expected splitDay 'upperA', got %q", rows[0].SplitDay)
	}
	if len(rows[0].Exercises) != 1 {
		t.Errorf("expected 1 exercise, got %d", len(rows[0].Exercises))
	}
	if rows[0].Exercises[0].ExerciseID != "bench-press" {
		t.Errorf("exercises JSON not round-tripped correctly")
	}
}

func TestUpsertRoutine_NewerWins(t *testing.T) {
	db := testDB(t)

	upsertRoutine(db, Routine{ID: "r-1", Name: "Original", SplitDay: "upperA", CreatedAt: 1000, UpdatedAt: 100})
	upsertRoutine(db, Routine{ID: "r-1", Name: "Updated", SplitDay: "upperA", CreatedAt: 1000, UpdatedAt: 200})

	rows, _ := fetchRoutinesSince(db, 0)
	if len(rows) != 1 {
		t.Fatalf("expected 1 routine, got %d", len(rows))
	}
	if rows[0].Name != "Updated" {
		t.Errorf("newer record should win; expected 'Updated', got %q", rows[0].Name)
	}
	if rows[0].UpdatedAt != 200 {
		t.Errorf("expected updatedAt=200, got %d", rows[0].UpdatedAt)
	}
}

func TestUpsertRoutine_OlderNoOverwrite(t *testing.T) {
	db := testDB(t)

	upsertRoutine(db, Routine{ID: "r-1", Name: "Original", SplitDay: "upperA", CreatedAt: 1000, UpdatedAt: 200})
	// Stale record with older updated_at — should NOT overwrite
	upsertRoutine(db, Routine{ID: "r-1", Name: "Stale", SplitDay: "upperA", CreatedAt: 1000, UpdatedAt: 50})

	rows, _ := fetchRoutinesSince(db, 0)
	if rows[0].Name != "Original" {
		t.Errorf("older record should not overwrite; expected 'Original', got %q", rows[0].Name)
	}
}

func TestFetchRoutinesSince_FiltersOlder(t *testing.T) {
	db := testDB(t)

	upsertRoutine(db, Routine{ID: "r-1", Name: "Early", SplitDay: "upperA", CreatedAt: 1000, UpdatedAt: 50})
	upsertRoutine(db, Routine{ID: "r-2", Name: "Late", SplitDay: "lowerA", CreatedAt: 1000, UpdatedAt: 200})

	rows, err := fetchRoutinesSince(db, 100)
	if err != nil {
		t.Fatalf("fetchRoutinesSince: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected 1 routine since ts=100, got %d", len(rows))
	}
	if rows[0].ID != "r-2" {
		t.Errorf("expected r-2, got %q", rows[0].ID)
	}
}

func TestFetchRoutinesSince_Empty(t *testing.T) {
	db := testDB(t)
	rows, err := fetchRoutinesSince(db, 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(rows) != 0 {
		t.Errorf("expected 0 rows, got %d", len(rows))
	}
}

// ── Sessions ──────────────────────────────────────────────────────────────────

func TestUpsertSession_Insert(t *testing.T) {
	db := testDB(t)

	s := WorkoutSession{
		ID: "sess-1", RoutineID: "r-1", RoutineName: "Upper A",
		SplitDay: "upperA", StartedAt: 1_000_000, Notes: "felt good",
		UpdatedAt: 100,
	}
	if err := upsertSession(db, s); err != nil {
		t.Fatalf("upsertSession: %v", err)
	}

	rows, err := fetchSessionsSince(db, 0)
	if err != nil {
		t.Fatalf("fetchSessionsSince: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected 1 session, got %d", len(rows))
	}
	if rows[0].RoutineName != "Upper A" {
		t.Errorf("expected routineName 'Upper A', got %q", rows[0].RoutineName)
	}
	if rows[0].Notes != "felt good" {
		t.Errorf("expected notes 'felt good', got %q", rows[0].Notes)
	}
}

func TestUpsertSession_NewerWins(t *testing.T) {
	db := testDB(t)

	upsertSession(db, WorkoutSession{
		ID: "sess-1", RoutineID: "r-1", RoutineName: "Upper A",
		SplitDay: "upperA", StartedAt: 1_000_000, Notes: "original", UpdatedAt: 100,
	})
	upsertSession(db, WorkoutSession{
		ID: "sess-1", RoutineID: "r-1", RoutineName: "Upper A",
		SplitDay: "upperA", StartedAt: 1_000_000, Notes: "updated", UpdatedAt: 200,
	})

	rows, _ := fetchSessionsSince(db, 0)
	if rows[0].Notes != "updated" {
		t.Errorf("newer session should win; expected 'updated', got %q", rows[0].Notes)
	}
}

func TestUpsertSession_OlderNoOverwrite(t *testing.T) {
	db := testDB(t)

	upsertSession(db, WorkoutSession{
		ID: "sess-1", RoutineID: "r-1", RoutineName: "Upper A",
		SplitDay: "upperA", StartedAt: 1_000_000, Notes: "original", UpdatedAt: 200,
	})
	upsertSession(db, WorkoutSession{
		ID: "sess-1", RoutineID: "r-1", RoutineName: "Upper A",
		SplitDay: "upperA", StartedAt: 1_000_000, Notes: "stale", UpdatedAt: 50,
	})

	rows, _ := fetchSessionsSince(db, 0)
	if rows[0].Notes != "original" {
		t.Errorf("older session should not overwrite; expected 'original', got %q", rows[0].Notes)
	}
}

func TestUpsertSession_CompletedAt_Nullable(t *testing.T) {
	db := testDB(t)

	// Insert without completedAt
	upsertSession(db, WorkoutSession{
		ID: "sess-1", RoutineID: "r-1", RoutineName: "Upper A",
		SplitDay: "upperA", StartedAt: 1_000_000, UpdatedAt: 100,
	})

	rows, _ := fetchSessionsSince(db, 0)
	if rows[0].CompletedAt != nil {
		t.Errorf("expected completedAt nil, got %v", rows[0].CompletedAt)
	}

	// Complete the session
	completed := int64(2_000_000)
	upsertSession(db, WorkoutSession{
		ID: "sess-1", RoutineID: "r-1", RoutineName: "Upper A",
		SplitDay: "upperA", StartedAt: 1_000_000, CompletedAt: &completed, UpdatedAt: 300,
	})

	rows, _ = fetchSessionsSince(db, 0)
	if rows[0].CompletedAt == nil {
		t.Error("expected completedAt to be set after update")
	} else if *rows[0].CompletedAt != completed {
		t.Errorf("expected completedAt=%d, got %d", completed, *rows[0].CompletedAt)
	}
}

func TestFetchSessionsSince_FiltersOlder(t *testing.T) {
	db := testDB(t)

	upsertSession(db, WorkoutSession{
		ID: "sess-1", RoutineID: "r-1", RoutineName: "A",
		SplitDay: "upperA", StartedAt: 1000, UpdatedAt: 50,
	})
	upsertSession(db, WorkoutSession{
		ID: "sess-2", RoutineID: "r-1", RoutineName: "B",
		SplitDay: "lowerA", StartedAt: 2000, UpdatedAt: 300,
	})

	rows, err := fetchSessionsSince(db, 100)
	if err != nil {
		t.Fatalf("fetchSessionsSince: %v", err)
	}
	if len(rows) != 1 || rows[0].ID != "sess-2" {
		t.Errorf("expected only sess-2, got %v", rows)
	}
}

// ── Sets ──────────────────────────────────────────────────────────────────────

// insertTestSession creates a parent session so foreign-key constraints pass.
func insertTestSession(t *testing.T, db *sql.DB) {
	t.Helper()
	err := upsertSession(db, WorkoutSession{
		ID: "sess-1", RoutineID: "r-1", RoutineName: "Upper A",
		SplitDay: "upperA", StartedAt: 1_000_000, UpdatedAt: 1,
	})
	if err != nil {
		t.Fatalf("insertTestSession: %v", err)
	}
}

func TestUpsertSet_Insert(t *testing.T) {
	db := testDB(t)
	insertTestSession(t, db)

	rpe := 8.0
	s := SetLog{
		ID: "set-1", SessionID: "sess-1", ExerciseID: "bench-press",
		ExerciseName: "Bench Press", SetNumber: 1, Reps: 8,
		WeightKg: 80, RPE: &rpe, Volume: 640, Timestamp: 1_000_000, UpdatedAt: 100,
	}
	if err := upsertSet(db, s); err != nil {
		t.Fatalf("upsertSet: %v", err)
	}

	rows, err := fetchSetsSince(db, 0)
	if err != nil {
		t.Fatalf("fetchSetsSince: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected 1 set, got %d", len(rows))
	}
	if rows[0].WeightKg != 80 {
		t.Errorf("expected weightKg=80, got %g", rows[0].WeightKg)
	}
	if rows[0].Reps != 8 {
		t.Errorf("expected reps=8, got %d", rows[0].Reps)
	}
	if rows[0].RPE == nil || *rows[0].RPE != 8.0 {
		t.Errorf("expected rpe=8.0, got %v", rows[0].RPE)
	}
}

func TestUpsertSet_NullRPE(t *testing.T) {
	db := testDB(t)
	insertTestSession(t, db)

	s := SetLog{
		ID: "set-1", SessionID: "sess-1", ExerciseID: "squat",
		ExerciseName: "Squat", SetNumber: 1, Reps: 5,
		WeightKg: 140, RPE: nil, Volume: 700, Timestamp: 1_000_000, UpdatedAt: 100,
	}
	if err := upsertSet(db, s); err != nil {
		t.Fatalf("upsertSet: %v", err)
	}

	rows, _ := fetchSetsSince(db, 0)
	if rows[0].RPE != nil {
		t.Errorf("expected nil RPE, got %v", rows[0].RPE)
	}
}

func TestUpsertSet_NewerWins(t *testing.T) {
	db := testDB(t)
	insertTestSession(t, db)

	base := SetLog{
		ID: "set-1", SessionID: "sess-1", ExerciseID: "bench",
		ExerciseName: "Bench", SetNumber: 1, Reps: 8, WeightKg: 80,
		Volume: 640, Timestamp: 1_000_000, UpdatedAt: 100,
	}
	upsertSet(db, base)

	updated := base
	updated.Reps = 10
	updated.WeightKg = 85
	updated.Volume = 850
	updated.UpdatedAt = 200
	upsertSet(db, updated)

	rows, _ := fetchSetsSince(db, 0)
	if rows[0].Reps != 10 || rows[0].WeightKg != 85 {
		t.Errorf("newer set should win: reps=%d weightKg=%g", rows[0].Reps, rows[0].WeightKg)
	}
}

func TestUpsertSet_OlderNoOverwrite(t *testing.T) {
	db := testDB(t)
	insertTestSession(t, db)

	base := SetLog{
		ID: "set-1", SessionID: "sess-1", ExerciseID: "bench",
		ExerciseName: "Bench", SetNumber: 1, Reps: 8, WeightKg: 80,
		Volume: 640, Timestamp: 1_000_000, UpdatedAt: 200,
	}
	upsertSet(db, base)

	stale := base
	stale.Reps = 5
	stale.WeightKg = 50
	stale.UpdatedAt = 50
	upsertSet(db, stale)

	rows, _ := fetchSetsSince(db, 0)
	if rows[0].Reps != 8 {
		t.Errorf("older set should not overwrite; expected reps=8, got %d", rows[0].Reps)
	}
}

func TestFetchSetsSince_FiltersOlder(t *testing.T) {
	db := testDB(t)
	insertTestSession(t, db)

	upsertSet(db, SetLog{
		ID: "set-1", SessionID: "sess-1", ExerciseID: "e1",
		ExerciseName: "E1", SetNumber: 1, Reps: 8, WeightKg: 80,
		Volume: 640, Timestamp: 1000, UpdatedAt: 50,
	})
	upsertSet(db, SetLog{
		ID: "set-2", SessionID: "sess-1", ExerciseID: "e2",
		ExerciseName: "E2", SetNumber: 2, Reps: 6, WeightKg: 100,
		Volume: 600, Timestamp: 2000, UpdatedAt: 300,
	})

	rows, err := fetchSetsSince(db, 100)
	if err != nil {
		t.Fatalf("fetchSetsSince: %v", err)
	}
	if len(rows) != 1 || rows[0].ID != "set-2" {
		t.Errorf("expected only set-2, got %v", rows)
	}
}
