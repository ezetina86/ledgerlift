package main

import (
	"context"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

var (
	sharedClientOnce sync.Once
	sharedStore      *Store
	sharedStoreErr   error
	dbCounter        atomic.Int64
)

func testMongoURI() string {
	if uri := os.Getenv("MONGODB_URI"); uri != "" {
		return uri
	}
	return "mongodb://localhost:27017"
}

// testDB creates an isolated MongoDB database for a test and drops it when the test ends.
func testDB(t *testing.T) *Store {
	t.Helper()

	sharedClientOnce.Do(func() {
		sharedStore, sharedStoreErr = InitDB(testMongoURI(), "ledgerlift_test_init")
		if sharedStoreErr == nil {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			_ = sharedStore.DB.Drop(ctx)
		}
	})
	if sharedStoreErr != nil {
		t.Fatalf("failed to connect to test MongoDB (%s): %v", testMongoURI(), sharedStoreErr)
	}

	dbName := fmt.Sprintf("ll_test_%d_%d", time.Now().UnixMilli(), dbCounter.Add(1))
	db := sharedStore.Client.Database(dbName)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := ensureIndexes(ctx, db); err != nil {
		t.Fatalf("ensureIndexes: %v", err)
	}

	s := &Store{Client: sharedStore.Client, DB: db}
	t.Cleanup(func() {
		dropCtx, dropCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer dropCancel()
		_ = db.Drop(dropCtx)
	})
	return s
}

// ── Schema & Indexes ──────────────────────────────────────────────────────────

func TestInitDB_IndexesExist(t *testing.T) {
	db := testDB(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	expected := map[string][]string{
		"routines":       {"idx_routines_updated"},
		"sessions":       {"idx_sessions_updated"},
		"sets":           {"idx_sets_updated", "idx_sets_session"},
		"mesocycles":     {"idx_mesos_updated"},
		"exercise_swaps": {"idx_swaps_mesocycle", "idx_swaps_swapped"},
		"run_sessions":   {"idx_run_sessions_updated"},
		"run_programs":   {"idx_run_programs_updated"},
	}

	for coll, idxNames := range expected {
		specs, err := db.DB.Collection(coll).Indexes().ListSpecifications(ctx)
		if err != nil {
			t.Fatalf("list indexes for %s: %v", coll, err)
		}
		found := make(map[string]bool)
		for _, sp := range specs {
			found[sp.Name] = true
		}
		for _, want := range idxNames {
			if !found[want] {
				t.Errorf("collection %q missing index %q", coll, want)
			}
		}
	}
}

func TestInitDB_Errors(t *testing.T) {
	if _, err := InitDB("", "ledgerlift"); err == nil {
		t.Error("expected error when URI is empty")
	}
	if _, err := InitDB("://bad-uri", ""); err == nil {
		t.Error("expected error for invalid URI")
	}
	var nilStore *Store
	if err := nilStore.Close(); err != nil {
		t.Errorf("expected nil error closing nil Store, got %v", err)
	}
}

func TestStore_PingAndFreshConnect(t *testing.T) {
	s, err := InitDB(testMongoURI(), "ll_test_fresh_ping")
	if err != nil {
		t.Fatalf("InitDB: %v", err)
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = s.DB.Drop(ctx)
		_ = s.Close()
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := s.Ping(ctx); err != nil {
		t.Errorf("Ping: %v", err)
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
	if err := upsertRoutine(db, r, 0); err != nil {
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
		t.Errorf("exercises BSON not round-tripped correctly")
	}
}

func TestUpsertRoutine_NewerWins(t *testing.T) {
	db := testDB(t)

	_ = upsertRoutine(db, Routine{ID: "r-1", Name: "Original", SplitDay: "upperA", CreatedAt: 1000, UpdatedAt: 100}, 0)
	_ = upsertRoutine(db, Routine{ID: "r-1", Name: "Updated", SplitDay: "upperA", CreatedAt: 1000, UpdatedAt: 200}, 0)

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

	_ = upsertRoutine(db, Routine{ID: "r-1", Name: "Original", SplitDay: "upperA", CreatedAt: 1000, UpdatedAt: 200}, 0)
	// Stale record with older updated_at — should NOT overwrite
	_ = upsertRoutine(db, Routine{ID: "r-1", Name: "Stale", SplitDay: "upperA", CreatedAt: 1000, UpdatedAt: 50}, 0)

	rows, _ := fetchRoutinesSince(db, 0)
	if rows[0].Name != "Original" {
		t.Errorf("older record should not overwrite; expected 'Original', got %q", rows[0].Name)
	}
}

func TestFetchRoutinesSince_FiltersOlder(t *testing.T) {
	db := testDB(t)

	_ = upsertRoutine(db, Routine{ID: "r-1", Name: "Early", SplitDay: "upperA", CreatedAt: 1000, UpdatedAt: 50}, 0)
	_ = upsertRoutine(db, Routine{ID: "r-2", Name: "Late", SplitDay: "lowerA", CreatedAt: 1000, UpdatedAt: 200}, 0)

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
	if err := upsertSession(db, s, 0); err != nil {
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

	_ = upsertSession(db, WorkoutSession{
		ID: "sess-1", RoutineID: "r-1", RoutineName: "Upper A",
		SplitDay: "upperA", StartedAt: 1_000_000, Notes: "original", UpdatedAt: 100,
	}, 0)
	_ = upsertSession(db, WorkoutSession{
		ID: "sess-1", RoutineID: "r-1", RoutineName: "Upper A",
		SplitDay: "upperA", StartedAt: 1_000_000, Notes: "updated", UpdatedAt: 200,
	}, 0)

	rows, _ := fetchSessionsSince(db, 0)
	if rows[0].Notes != "updated" {
		t.Errorf("newer session should win; expected 'updated', got %q", rows[0].Notes)
	}
}

func TestUpsertSession_OlderNoOverwrite(t *testing.T) {
	db := testDB(t)

	_ = upsertSession(db, WorkoutSession{
		ID: "sess-1", RoutineID: "r-1", RoutineName: "Upper A",
		SplitDay: "upperA", StartedAt: 1_000_000, Notes: "original", UpdatedAt: 200,
	}, 0)
	_ = upsertSession(db, WorkoutSession{
		ID: "sess-1", RoutineID: "r-1", RoutineName: "Upper A",
		SplitDay: "upperA", StartedAt: 1_000_000, Notes: "stale", UpdatedAt: 50,
	}, 0)

	rows, _ := fetchSessionsSince(db, 0)
	if rows[0].Notes != "original" {
		t.Errorf("older session should not overwrite; expected 'original', got %q", rows[0].Notes)
	}
}

func TestUpsertSession_CompletedAt_Nullable(t *testing.T) {
	db := testDB(t)

	// Insert without completedAt
	_ = upsertSession(db, WorkoutSession{
		ID: "sess-1", RoutineID: "r-1", RoutineName: "Upper A",
		SplitDay: "upperA", StartedAt: 1_000_000, UpdatedAt: 100,
	}, 0)

	rows, _ := fetchSessionsSince(db, 0)
	if rows[0].CompletedAt != nil {
		t.Errorf("expected completedAt nil, got %v", rows[0].CompletedAt)
	}

	// Complete the session
	completed := int64(2_000_000)
	_ = upsertSession(db, WorkoutSession{
		ID: "sess-1", RoutineID: "r-1", RoutineName: "Upper A",
		SplitDay: "upperA", StartedAt: 1_000_000, CompletedAt: &completed, UpdatedAt: 300,
	}, 0)

	rows, _ = fetchSessionsSince(db, 0)
	if rows[0].CompletedAt == nil {
		t.Error("expected completedAt to be set after update")
	} else if *rows[0].CompletedAt != completed {
		t.Errorf("expected completedAt=%d, got %d", completed, *rows[0].CompletedAt)
	}
}

func TestFetchSessionsSince_FiltersOlder(t *testing.T) {
	db := testDB(t)

	_ = upsertSession(db, WorkoutSession{
		ID: "sess-1", RoutineID: "r-1", RoutineName: "A",
		SplitDay: "upperA", StartedAt: 1000, UpdatedAt: 50,
	}, 0)
	_ = upsertSession(db, WorkoutSession{
		ID: "sess-2", RoutineID: "r-1", RoutineName: "B",
		SplitDay: "lowerA", StartedAt: 2000, UpdatedAt: 300,
	}, 0)

	rows, err := fetchSessionsSince(db, 100)
	if err != nil {
		t.Fatalf("fetchSessionsSince: %v", err)
	}
	if len(rows) != 1 || rows[0].ID != "sess-2" {
		t.Errorf("expected only sess-2, got %v", rows)
	}
}

// ── Sets ──────────────────────────────────────────────────────────────────────

func insertTestSession(t *testing.T, db *Store) {
	t.Helper()
	err := upsertSession(db, WorkoutSession{
		ID: "sess-1", RoutineID: "r-1", RoutineName: "Upper A",
		SplitDay: "upperA", StartedAt: 1_000_000, UpdatedAt: 1,
	}, 0)
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
	if err := upsertSet(db, s, 0); err != nil {
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
	if err := upsertSet(db, s, 0); err != nil {
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
	_ = upsertSet(db, base, 0)

	updated := base
	updated.Reps = 10
	updated.WeightKg = 85
	updated.Volume = 850
	updated.UpdatedAt = 200
	_ = upsertSet(db, updated, 0)

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
	_ = upsertSet(db, base, 0)

	stale := base
	stale.Reps = 5
	stale.WeightKg = 50
	stale.UpdatedAt = 50
	_ = upsertSet(db, stale, 0)

	rows, _ := fetchSetsSince(db, 0)
	if rows[0].Reps != 8 {
		t.Errorf("older set should not overwrite; expected reps=8, got %d", rows[0].Reps)
	}
}

func TestFetchSetsSince_FiltersOlder(t *testing.T) {
	db := testDB(t)
	insertTestSession(t, db)

	_ = upsertSet(db, SetLog{
		ID: "set-1", SessionID: "sess-1", ExerciseID: "e1",
		ExerciseName: "E1", SetNumber: 1, Reps: 8, WeightKg: 80,
		Volume: 640, Timestamp: 1000, UpdatedAt: 50,
	}, 0)
	_ = upsertSet(db, SetLog{
		ID: "set-2", SessionID: "sess-1", ExerciseID: "e2",
		ExerciseName: "E2", SetNumber: 2, Reps: 6, WeightKg: 100,
		Volume: 600, Timestamp: 2000, UpdatedAt: 300,
	}, 0)

	rows, err := fetchSetsSince(db, 100)
	if err != nil {
		t.Fatalf("fetchSetsSince: %v", err)
	}
	if len(rows) != 1 || rows[0].ID != "set-2" {
		t.Errorf("expected only set-2, got %v", rows)
	}
}

// ── Mesocycles ─────────────────────────────────────────────────────────────────

func TestUpsertMesocycle_Insert(t *testing.T) {
	db := testDB(t)

	m := Mesocycle{
		ID: "meso-1", Number: 1, Name: "Mesocycle 1", TargetWeeks: 5,
		StartedAt: 1_000_000, EndedAt: nil, IsDeloadWeek: false, UpdatedAt: 100,
	}
	if err := upsertMesocycle(db, m, 0); err != nil {
		t.Fatalf("upsertMesocycle: %v", err)
	}

	rows, err := fetchMesocyclesSince(db, 0)
	if err != nil {
		t.Fatalf("fetchMesocyclesSince: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected 1 mesocycle, got %d", len(rows))
	}
	if rows[0].Name != "Mesocycle 1" {
		t.Errorf("expected name 'Mesocycle 1', got %q", rows[0].Name)
	}
	if rows[0].Number != 1 {
		t.Errorf("expected number=1, got %d", rows[0].Number)
	}
	if rows[0].TargetWeeks != 5 {
		t.Errorf("expected targetWeeks=5, got %d", rows[0].TargetWeeks)
	}
	if rows[0].EndedAt != nil {
		t.Errorf("expected endedAt nil, got %v", rows[0].EndedAt)
	}
}

func TestUpsertMesocycle_NewerWins(t *testing.T) {
	db := testDB(t)

	_ = upsertMesocycle(db, Mesocycle{ID: "meso-1", Number: 1, Name: "Original", TargetWeeks: 5, StartedAt: 1_000_000, UpdatedAt: 100}, 0)
	_ = upsertMesocycle(db, Mesocycle{ID: "meso-1", Number: 1, Name: "Updated", TargetWeeks: 5, StartedAt: 1_000_000, UpdatedAt: 200}, 0)

	rows, _ := fetchMesocyclesSince(db, 0)
	if len(rows) != 1 {
		t.Fatalf("expected 1 mesocycle, got %d", len(rows))
	}
	if rows[0].Name != "Updated" {
		t.Errorf("newer record should win; expected 'Updated', got %q", rows[0].Name)
	}
}

func TestUpsertMesocycle_OlderNoOverwrite(t *testing.T) {
	db := testDB(t)

	_ = upsertMesocycle(db, Mesocycle{ID: "meso-1", Number: 1, Name: "Original", TargetWeeks: 5, StartedAt: 1_000_000, UpdatedAt: 200}, 0)
	_ = upsertMesocycle(db, Mesocycle{ID: "meso-1", Number: 1, Name: "Stale", TargetWeeks: 5, StartedAt: 1_000_000, UpdatedAt: 50}, 0)

	rows, _ := fetchMesocyclesSince(db, 0)
	if rows[0].Name != "Original" {
		t.Errorf("older record should not overwrite; expected 'Original', got %q", rows[0].Name)
	}
}

func TestUpsertMesocycle_IsDeloadWeek_RoundTrip(t *testing.T) {
	db := testDB(t)

	_ = upsertMesocycle(db, Mesocycle{ID: "meso-1", Number: 1, Name: "M1", TargetWeeks: 5, StartedAt: 1_000_000, IsDeloadWeek: false, UpdatedAt: 100}, 0)
	rows, _ := fetchMesocyclesSince(db, 0)
	if rows[0].IsDeloadWeek {
		t.Error("expected IsDeloadWeek=false")
	}

	_ = upsertMesocycle(db, Mesocycle{ID: "meso-1", Number: 1, Name: "M1", TargetWeeks: 5, StartedAt: 1_000_000, IsDeloadWeek: true, UpdatedAt: 200}, 0)
	rows, _ = fetchMesocyclesSince(db, 0)
	if !rows[0].IsDeloadWeek {
		t.Error("expected IsDeloadWeek=true after update")
	}
}

func TestUpsertMesocycle_EndedAt_Nullable(t *testing.T) {
	db := testDB(t)

	_ = upsertMesocycle(db, Mesocycle{ID: "meso-1", Number: 1, Name: "M1", TargetWeeks: 5, StartedAt: 1_000_000, EndedAt: nil, UpdatedAt: 100}, 0)
	rows, _ := fetchMesocyclesSince(db, 0)
	if rows[0].EndedAt != nil {
		t.Errorf("expected endedAt nil, got %v", rows[0].EndedAt)
	}

	ended := int64(2_000_000)
	_ = upsertMesocycle(db, Mesocycle{ID: "meso-1", Number: 1, Name: "M1", TargetWeeks: 5, StartedAt: 1_000_000, EndedAt: &ended, UpdatedAt: 300}, 0)
	rows, _ = fetchMesocyclesSince(db, 0)
	if rows[0].EndedAt == nil {
		t.Error("expected endedAt to be set after ending cycle")
	} else if *rows[0].EndedAt != ended {
		t.Errorf("expected endedAt=%d, got %d", ended, *rows[0].EndedAt)
	}
}

func TestFetchMesocyclesSince_FiltersOlder(t *testing.T) {
	db := testDB(t)

	_ = upsertMesocycle(db, Mesocycle{ID: "meso-1", Number: 1, Name: "Early", TargetWeeks: 5, StartedAt: 1000, UpdatedAt: 50}, 0)
	_ = upsertMesocycle(db, Mesocycle{ID: "meso-2", Number: 2, Name: "Late", TargetWeeks: 4, StartedAt: 2000, UpdatedAt: 300}, 0)

	rows, err := fetchMesocyclesSince(db, 100)
	if err != nil {
		t.Fatalf("fetchMesocyclesSince: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected 1 mesocycle since ts=100, got %d", len(rows))
	}
	if rows[0].ID != "meso-2" {
		t.Errorf("expected meso-2, got %q", rows[0].ID)
	}
}

func TestFetchMesocyclesSince_Empty(t *testing.T) {
	db := testDB(t)
	rows, err := fetchMesocyclesSince(db, 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(rows) != 0 {
		t.Errorf("expected 0 rows, got %d", len(rows))
	}
}

// ── Exercise Swaps ─────────────────────────────────────────────────────────────

func TestUpsertExerciseSwap_Insert(t *testing.T) {
	db := testDB(t)

	s := ExerciseSwap{
		ID: "swap-1", MesocycleID: "meso-1", RoutineID: "upper-a",
		RemovedExerciseID: "bench-press", AddedExerciseID: "incline-press", SwappedAt: 1_000_000,
	}
	if err := upsertExerciseSwap(db, s); err != nil {
		t.Fatalf("upsertExerciseSwap: %v", err)
	}

	rows, err := fetchExerciseSwapsSince(db, 0)
	if err != nil {
		t.Fatalf("fetchExerciseSwapsSince: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected 1 swap, got %d", len(rows))
	}
	if rows[0].RemovedExerciseID != "bench-press" {
		t.Errorf("expected removedExerciseId 'bench-press', got %q", rows[0].RemovedExerciseID)
	}
	if rows[0].AddedExerciseID != "incline-press" {
		t.Errorf("expected addedExerciseId 'incline-press', got %q", rows[0].AddedExerciseID)
	}
	if rows[0].RoutineID != "upper-a" {
		t.Errorf("expected routineId 'upper-a', got %q", rows[0].RoutineID)
	}
}

func TestUpsertExerciseSwap_DuplicateIgnored(t *testing.T) {
	db := testDB(t)

	s := ExerciseSwap{
		ID: "swap-1", MesocycleID: "meso-1", RoutineID: "upper-a",
		RemovedExerciseID: "bench-press", AddedExerciseID: "incline-press", SwappedAt: 1_000_000,
	}
	_ = upsertExerciseSwap(db, s)
	// Insert the same ID again — $setOnInsert should keep original values
	s.AddedExerciseID = "dumbbell-press"
	_ = upsertExerciseSwap(db, s)

	rows, _ := fetchExerciseSwapsSince(db, 0)
	if len(rows) != 1 {
		t.Fatalf("expected 1 swap after duplicate insert, got %d", len(rows))
	}
	if rows[0].AddedExerciseID != "incline-press" {
		t.Errorf("duplicate should be ignored; expected 'incline-press', got %q", rows[0].AddedExerciseID)
	}
}

func TestFetchExerciseSwapsSince_FiltersOlder(t *testing.T) {
	db := testDB(t)

	_ = upsertExerciseSwap(db, ExerciseSwap{
		ID: "swap-1", MesocycleID: "meso-1", RoutineID: "upper-a",
		RemovedExerciseID: "ex-old", AddedExerciseID: "ex-new", SwappedAt: 50,
	})
	_ = upsertExerciseSwap(db, ExerciseSwap{
		ID: "swap-2", MesocycleID: "meso-1", RoutineID: "lower-a",
		RemovedExerciseID: "ex-old2", AddedExerciseID: "ex-new2", SwappedAt: 300,
	})

	rows, err := fetchExerciseSwapsSince(db, 100)
	if err != nil {
		t.Fatalf("fetchExerciseSwapsSince: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected 1 swap since ts=100, got %d", len(rows))
	}
	if rows[0].ID != "swap-2" {
		t.Errorf("expected swap-2, got %q", rows[0].ID)
	}
}

func TestFetchExerciseSwapsSince_Empty(t *testing.T) {
	db := testDB(t)
	rows, err := fetchExerciseSwapsSince(db, 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(rows) != 0 {
		t.Errorf("expected 0 rows, got %d", len(rows))
	}
}

// ── Session + Mesocycle fields ──────────────────────────────────────────────────

func TestUpsertSession_MesocycleFields(t *testing.T) {
	db := testDB(t)

	mesoID := "meso-1"
	s := WorkoutSession{
		ID: "sess-1", RoutineID: "r-1", RoutineName: "Upper A",
		SplitDay: "upperA", StartedAt: 1_000_000,
		MesocycleID: &mesoID, IsDeload: true,
		Swaps: map[string]string{"bench-press": "dumbbell-bench-press"},
		ExtraExercises: []RoutineExercise{
			{ExerciseID: "cable-crunch", Order: 7, DefaultSets: 3, DefaultReps: "12-15"},
		},
		UpdatedAt: 100,
	}
	if err := upsertSession(db, s, 0); err != nil {
		t.Fatalf("upsertSession: %v", err)
	}

	rows, err := fetchSessionsSince(db, 0)
	if err != nil {
		t.Fatalf("fetchSessionsSince: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected 1 session, got %d", len(rows))
	}
	if rows[0].MesocycleID == nil || *rows[0].MesocycleID != mesoID {
		t.Errorf("expected mesocycleId=%q, got %v", mesoID, rows[0].MesocycleID)
	}
	if !rows[0].IsDeload {
		t.Error("expected isDeload=true")
	}
	if rows[0].Swaps["bench-press"] != "dumbbell-bench-press" {
		t.Errorf("expected swaps round-trip, got %v", rows[0].Swaps)
	}
	if len(rows[0].ExtraExercises) != 1 || rows[0].ExtraExercises[0].ExerciseID != "cable-crunch" {
		t.Errorf("expected extraExercises round-trip, got %v", rows[0].ExtraExercises)
	}
}

// ── RunSessions ───────────────────────────────────────────────────────────────

func TestUpsertRunSession_Insert(t *testing.T) {
	db := testDB(t)
	rs := RunSession{ID: "rs-1", Week: 1, Day: 1, StartedAt: 1000, UpdatedAt: 100}
	if err := upsertRunSession(db, rs, 0); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	var got RunSession
	err := db.DB.Collection("run_sessions").FindOne(context.Background(), bson.M{"_id": "rs-1"}).Decode(&got)
	if err != nil || got.ID != "rs-1" {
		t.Fatalf("not found: %v", err)
	}
}

func TestUpsertRunSession_LastWriteWins(t *testing.T) {
	db := testDB(t)
	rs := RunSession{ID: "rs-2", Week: 1, Day: 2, StartedAt: 1000, UpdatedAt: 50}
	_ = upsertRunSession(db, rs, 0)

	completed := int64(2000)
	rs2 := RunSession{ID: "rs-2", Week: 1, Day: 2, StartedAt: 1000, CompletedAt: &completed, UpdatedAt: 200}
	_ = upsertRunSession(db, rs2, 0)

	rows, err := fetchRunSessionsSince(db, 0)
	if err != nil || len(rows) != 1 {
		t.Fatalf("query: %v", err)
	}
	if rows[0].CompletedAt == nil || *rows[0].CompletedAt != 2000 {
		t.Errorf("expected completed_at=2000, got %v", rows[0].CompletedAt)
	}
}

func TestFetchRunSessionsSince_ReturnsOnlyNewer(t *testing.T) {
	db := testDB(t)
	_ = upsertRunSession(db, RunSession{ID: "rs-old", Week: 1, Day: 1, StartedAt: 100, UpdatedAt: 10}, 0)
	_ = upsertRunSession(db, RunSession{ID: "rs-new", Week: 1, Day: 2, StartedAt: 200, UpdatedAt: 500}, 0)

	rows, err := fetchRunSessionsSince(db, 100)
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if len(rows) != 1 || rows[0].ID != "rs-new" {
		t.Errorf("expected [rs-new], got %v", rows)
	}
}

// ── RunPrograms ───────────────────────────────────────────────────────────────

func TestSyncRunPrograms(t *testing.T) {
	db := testDB(t)

	payload := SyncPayload{
		RunPrograms: []RunProgram{
			{ID: "rp-1", Number: 1, StartedAt: 1000, EndedAt: nil, UpdatedAt: 1000},
		},
	}
	res, err := UpsertSync(db, payload)
	if err != nil {
		t.Fatalf("UpsertSync: %v", err)
	}
	if len(res.RunPrograms) != 1 {
		t.Fatalf("expected 1 run_program, got %d", len(res.RunPrograms))
	}
	if res.RunPrograms[0].ID != "rp-1" {
		t.Errorf("expected id rp-1, got %s", res.RunPrograms[0].ID)
	}
}

func TestUpsertRunProgram_Insert(t *testing.T) {
	db := testDB(t)
	rp := RunProgram{ID: "rp-1", Number: 1, StartedAt: 1000, UpdatedAt: 100}
	if err := upsertRunProgram(db, rp, 0); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	var got RunProgram
	if err := db.DB.Collection("run_programs").FindOne(context.Background(), bson.M{"_id": "rp-1"}).Decode(&got); err != nil {
		t.Fatalf("not found: %v", err)
	}
}

func TestUpsertRunProgram_LastWriteWins(t *testing.T) {
	db := testDB(t)
	rp := RunProgram{ID: "rp-2", Number: 1, StartedAt: 1000, UpdatedAt: 50}
	_ = upsertRunProgram(db, rp, 0)

	ended := int64(2000)
	rp2 := RunProgram{ID: "rp-2", Number: 1, StartedAt: 1000, EndedAt: &ended, UpdatedAt: 200}
	_ = upsertRunProgram(db, rp2, 0)

	rows, err := fetchRunProgramsSince(db, 0)
	if err != nil || len(rows) != 1 {
		t.Fatalf("query: %v", err)
	}
	if rows[0].EndedAt == nil || *rows[0].EndedAt != 2000 {
		t.Errorf("expected ended_at=2000, got %v", rows[0].EndedAt)
	}
}

func TestFetchRunProgramsSince_ReturnsOnlyNewer(t *testing.T) {
	db := testDB(t)
	_ = upsertRunProgram(db, RunProgram{ID: "rp-old", Number: 1, StartedAt: 100, UpdatedAt: 10}, 0)
	_ = upsertRunProgram(db, RunProgram{ID: "rp-new", Number: 2, StartedAt: 200, UpdatedAt: 500}, 0)

	rows, err := fetchRunProgramsSince(db, 100)
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if len(rows) != 1 || rows[0].ID != "rp-new" {
		t.Errorf("expected [rp-new], got %v", rows)
	}
}

func TestUpsertSetAndRoutine_SetTypeAndBackups(t *testing.T) {
	db := testDB(t)

	r := Routine{
		ID: "upper-a", Name: "Upper A", SplitDay: "upperA",
		Exercises: []RoutineExercise{
			{
				ExerciseID:        "bench-press",
				Order:             1,
				DefaultSets:       3,
				DefaultReps:       "6-8",
				BackupExerciseIDs: []string{"machine-chest-press", "flat-dumbbell-press"},
			},
		},
		CreatedAt: 1000, UpdatedAt: 1000,
	}
	if err := upsertRoutine(db, r, 1000); err != nil {
		t.Fatalf("upsertRoutine: %v", err)
	}

	sess := WorkoutSession{
		ID: "sess-1", RoutineID: "upper-a", RoutineName: "Upper A",
		SplitDay: "upperA", StartedAt: 1000, UpdatedAt: 1000,
	}
	if err := upsertSession(db, sess, 1000); err != nil {
		t.Fatalf("upsertSession: %v", err)
	}

	s := SetLog{
		ID: "set-1", SessionID: "sess-1", ExerciseID: "bench-press",
		ExerciseName: "Bench Press", SetNumber: 1, Reps: 8, WeightKg: 80,
		SetType: "drop", Volume: 640, Timestamp: 1000, UpdatedAt: 1000,
	}
	if err := upsertSet(db, s, 1000); err != nil {
		t.Fatalf("upsertSet: %v", err)
	}

	routines, err := fetchRoutinesSince(db, 0)
	if err != nil || len(routines) != 1 {
		t.Fatalf("fetchRoutinesSince: %v", err)
	}
	if len(routines[0].Exercises[0].BackupExerciseIDs) != 2 {
		t.Errorf("expected 2 backupExerciseIds, got %v", routines[0].Exercises[0].BackupExerciseIDs)
	}

	sets, err := fetchSetsSince(db, 0)
	if err != nil || len(sets) != 1 {
		t.Fatalf("fetchSetsSince: %v", err)
	}
	if sets[0].SetType != "drop" {
		t.Errorf("expected setType 'drop', got %q", sets[0].SetType)
	}
}

func TestUpsertSet_DefaultSetType(t *testing.T) {
	db := testDB(t)
	insertTestSession(t, db)

	s := SetLog{
		ID: "set-default", SessionID: "sess-1", ExerciseID: "bench",
		ExerciseName: "Bench", SetNumber: 1, Reps: 8, WeightKg: 80,
		Volume: 640, Timestamp: 1000, UpdatedAt: 100,
	}
	if err := upsertSet(db, s, 0); err != nil {
		t.Fatalf("upsertSet: %v", err)
	}

	rows, err := fetchSetsSince(db, 0)
	if err != nil {
		t.Fatalf("fetchSetsSince: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected 1 set, got %d", len(rows))
	}
	if rows[0].SetType != "work" {
		t.Errorf("expected default setType 'work', got %q", rows[0].SetType)
	}
}
