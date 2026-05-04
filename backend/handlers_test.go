package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

// ── handleHealth ──────────────────────────────────────────────────────────────

func TestHandleHealth_StatusOK(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	w := httptest.NewRecorder()

	handleHealth(w, req)

	res := w.Result()
	if res.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", res.StatusCode)
	}
}

func TestHandleHealth_ReturnsJSONStatus(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	w := httptest.NewRecorder()

	handleHealth(w, req)

	var body map[string]string
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body["status"] != "ok" {
		t.Errorf("expected status=ok, got %q", body["status"])
	}
}

func TestHandleHealth_ContentTypeJSON(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	w := httptest.NewRecorder()

	handleHealth(w, req)

	ct := w.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("expected Content-Type application/json, got %q", ct)
	}
}

// ── CORS middleware ───────────────────────────────────────────────────────────

func TestCORSMiddleware_SetsHeaders(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := corsMiddleware(inner)

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Error("expected Access-Control-Allow-Origin: *")
	}
	if w.Header().Get("Access-Control-Allow-Methods") == "" {
		t.Error("expected Access-Control-Allow-Methods to be set")
	}
}

func TestCORSMiddleware_PreflightReturns204(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := corsMiddleware(inner)

	req := httptest.NewRequest(http.MethodOptions, "/api/sync", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("preflight should return 204, got %d", w.Code)
	}
}

func TestCORSMiddleware_PreflightDoesNotCallInner(t *testing.T) {
	called := false
	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})
	handler := corsMiddleware(inner)

	req := httptest.NewRequest(http.MethodOptions, "/", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if called {
		t.Error("inner handler should not be called on OPTIONS preflight")
	}
}

// ── writeJSON ─────────────────────────────────────────────────────────────────

func TestWriteJSON_StatusCode(t *testing.T) {
	w := httptest.NewRecorder()
	writeJSON(w, http.StatusCreated, map[string]string{"id": "abc"})
	if w.Code != http.StatusCreated {
		t.Errorf("expected 201, got %d", w.Code)
	}
}

func TestWriteJSON_Body(t *testing.T) {
	w := httptest.NewRecorder()
	writeJSON(w, http.StatusOK, map[string]int{"count": 42})

	var body map[string]int
	json.NewDecoder(w.Body).Decode(&body)
	if body["count"] != 42 {
		t.Errorf("expected count=42, got %d", body["count"])
	}
}

// ── envOr ─────────────────────────────────────────────────────────────────────

func TestEnvOr_ReturnsFallbackWhenNotSet(t *testing.T) {
	os.Unsetenv("TEST_KEY_LEDGERLIFT")
	got := envOr("TEST_KEY_LEDGERLIFT", "default")
	if got != "default" {
		t.Errorf("expected 'default', got %q", got)
	}
}

func TestEnvOr_ReturnsEnvValueWhenSet(t *testing.T) {
	os.Setenv("TEST_KEY_LEDGERLIFT", "from-env")
	defer os.Unsetenv("TEST_KEY_LEDGERLIFT")
	got := envOr("TEST_KEY_LEDGERLIFT", "default")
	if got != "from-env" {
		t.Errorf("expected 'from-env', got %q", got)
	}
}

// ── makeSync ──────────────────────────────────────────────────────────────────

func TestMakeSync_InvalidJSON(t *testing.T) {
	db := testDB(t)
	handler := makeSync(db)

	req := httptest.NewRequest(http.MethodPost, "/api/sync", bytes.NewBufferString(`{bad json`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid JSON, got %d", w.Code)
	}
}

func TestMakeSync_EmptyPayload(t *testing.T) {
	db := testDB(t)
	handler := makeSync(db)

	body := `{"lastSyncAt":0,"sessions":[],"sets":[],"routines":[]}`
	req := httptest.NewRequest(http.MethodPost, "/api/sync", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp SyncResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(resp.Sessions) != 0 || len(resp.Sets) != 0 || len(resp.Routines) != 0 {
		t.Errorf("expected empty arrays in response")
	}
	if resp.SyncedAt <= 0 {
		t.Errorf("expected non-zero syncedAt")
	}
}

func TestMakeSync_PushRoutineAndFetchBack(t *testing.T) {
	db := testDB(t)
	handler := makeSync(db)

	// Push one routine
	reqBody := SyncRequest{
		LastSyncAt: 0,
		Routines: []Routine{{
			ID: "upper-a", Name: "Upper A", SplitDay: "upperA",
			Exercises: []RoutineExercise{{ExerciseID: "bench-press", Order: 1, DefaultSets: 3, DefaultReps: "8-12"}},
			CreatedAt: 1000, UpdatedAt: 500,
		}},
		Sessions: []WorkoutSession{},
		Sets:     []SetLog{},
	}
	encoded, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/api/sync", bytes.NewBuffer(encoded))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp SyncResponse
	json.NewDecoder(w.Body).Decode(&resp)

	// The routine we pushed should come back (lastSyncAt=0 means fetch everything)
	if len(resp.Routines) != 1 {
		t.Fatalf("expected 1 routine in response, got %d", len(resp.Routines))
	}
	if resp.Routines[0].ID != "upper-a" {
		t.Errorf("expected routine id 'upper-a', got %q", resp.Routines[0].ID)
	}
	if resp.Routines[0].Name != "Upper A" {
		t.Errorf("expected routine name 'Upper A', got %q", resp.Routines[0].Name)
	}
}

func TestMakeSync_PushSessionAndSet(t *testing.T) {
	db := testDB(t)
	handler := makeSync(db)

	completedAt := int64(2_000_000)
	rpe := 8.0

	reqBody := SyncRequest{
		LastSyncAt: 0,
		Routines:   []Routine{},
		Sessions: []WorkoutSession{{
			ID: "sess-1", RoutineID: "r-1", RoutineName: "Upper A",
			SplitDay: "upperA", StartedAt: 1_000_000, CompletedAt: &completedAt,
			Notes: "", UpdatedAt: 100,
		}},
		Sets: []SetLog{{
			ID: "set-1", SessionID: "sess-1", ExerciseID: "bench-press",
			ExerciseName: "Bench Press", SetNumber: 1, Reps: 8, WeightKg: 80,
			RPE: &rpe, Volume: 640, Timestamp: 1_500_000, UpdatedAt: 200,
		}},
	}
	encoded, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/api/sync", bytes.NewBuffer(encoded))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp SyncResponse
	json.NewDecoder(w.Body).Decode(&resp)

	if len(resp.Sessions) != 1 {
		t.Fatalf("expected 1 session, got %d", len(resp.Sessions))
	}
	if resp.Sessions[0].ID != "sess-1" {
		t.Errorf("expected sess-1, got %q", resp.Sessions[0].ID)
	}

	if len(resp.Sets) != 1 {
		t.Fatalf("expected 1 set, got %d", len(resp.Sets))
	}
	if resp.Sets[0].WeightKg != 80 {
		t.Errorf("expected weightKg=80, got %g", resp.Sets[0].WeightKg)
	}
}

func TestMakeSync_DeltaFetch_LastSyncAt(t *testing.T) {
	db := testDB(t)
	// Use a fixed clock so serverNow (50) < all UpdatedAt values,
	// preserving the original timestamps for the delta filter assertion.
	handler := makeSync(db, func() int64 { return 50 })

	// Push two routines with different updatedAt values
	firstPush := SyncRequest{
		LastSyncAt: 0,
		Routines: []Routine{
			{ID: "r-1", Name: "Old", SplitDay: "upperA", CreatedAt: 100, UpdatedAt: 100},
			{ID: "r-2", Name: "New", SplitDay: "lowerA", CreatedAt: 500, UpdatedAt: 500},
		},
		Sessions: []WorkoutSession{},
		Sets:     []SetLog{},
	}
	encoded, _ := json.Marshal(firstPush)
	req := httptest.NewRequest(http.MethodPost, "/api/sync", bytes.NewBuffer(encoded))
	req.Header.Set("Content-Type", "application/json")
	httptest.NewRecorder() // discard first response
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	// Now fetch with lastSyncAt=200 — should only return r-2 (updatedAt=500 > 200)
	deltaReq := SyncRequest{LastSyncAt: 200, Sessions: []WorkoutSession{}, Sets: []SetLog{}, Routines: []Routine{}}
	encoded, _ = json.Marshal(deltaReq)
	req2 := httptest.NewRequest(http.MethodPost, "/api/sync", bytes.NewBuffer(encoded))
	req2.Header.Set("Content-Type", "application/json")
	w2 := httptest.NewRecorder()
	handler.ServeHTTP(w2, req2)

	var resp SyncResponse
	json.NewDecoder(w2.Body).Decode(&resp)

	if len(resp.Routines) != 1 {
		t.Fatalf("expected 1 routine with delta lastSyncAt=200, got %d", len(resp.Routines))
	}
	if resp.Routines[0].ID != "r-2" {
		t.Errorf("expected r-2, got %q", resp.Routines[0].ID)
	}
}

func TestMakeSync_StampsMissingUpdatedAt(t *testing.T) {
	db := testDB(t)
	handler := makeSync(db)

	// Routine with UpdatedAt=0 — server should stamp it
	reqBody := SyncRequest{
		LastSyncAt: 0,
		Routines: []Routine{{
			ID: "r-zero", Name: "No Timestamp", SplitDay: "upperA",
			CreatedAt: 1000, UpdatedAt: 0,
		}},
		Sessions: []WorkoutSession{},
		Sets:     []SetLog{},
	}
	encoded, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/api/sync", bytes.NewBuffer(encoded))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	var resp SyncResponse
	json.NewDecoder(w.Body).Decode(&resp)

	if len(resp.Routines) != 1 {
		t.Fatalf("expected 1 routine, got %d", len(resp.Routines))
	}
	if resp.Routines[0].UpdatedAt <= 0 {
		t.Errorf("expected server-stamped updatedAt > 0, got %d", resp.Routines[0].UpdatedAt)
	}
}
