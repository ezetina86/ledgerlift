package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type Store struct {
	Client *mongo.Client
	DB     *mongo.Database
}

func (s *Store) Close() error {
	if s == nil || s.Client == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return s.Client.Disconnect(ctx)
}

func (s *Store) Ping(ctx context.Context) error {
	return s.Client.Ping(ctx, nil)
}

func InitDB(uri, dbName string) (*Store, error) {
	if uri == "" {
		return nil, fmt.Errorf("mongodb uri is required")
	}
	if dbName == "" {
		dbName = "ledgerlift"
	}

	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		return nil, fmt.Errorf("connect mongo: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := client.Ping(ctx, nil); err != nil {
		_ = client.Disconnect(ctx)
		return nil, fmt.Errorf("ping mongo: %w", err)
	}

	db := client.Database(dbName)
	store := &Store{Client: client, DB: db}
	if err := ensureIndexes(ctx, db); err != nil {
		_ = store.Close()
		return nil, fmt.Errorf("ensure indexes: %w", err)
	}
	return store, nil
}

func initDB(uri, dbName string) *Store {
	s, err := InitDB(uri, dbName)
	if err != nil {
		log.Fatalf("init db: %v", err)
	}
	return s
}

func ensureIndexes(ctx context.Context, db *mongo.Database) error {
	specs := []struct {
		coll string
		name string
		keys bson.D
	}{
		{"routines", "idx_routines_updated", bson.D{{Key: "updatedAt", Value: 1}}},
		{"sessions", "idx_sessions_updated", bson.D{{Key: "updatedAt", Value: 1}}},
		{"sets", "idx_sets_updated", bson.D{{Key: "updatedAt", Value: 1}}},
		{"sets", "idx_sets_session", bson.D{{Key: "sessionId", Value: 1}}},
		{"mesocycles", "idx_mesos_updated", bson.D{{Key: "updatedAt", Value: 1}}},
		{"exercise_swaps", "idx_swaps_mesocycle", bson.D{{Key: "mesocycleId", Value: 1}}},
		{"exercise_swaps", "idx_swaps_swapped", bson.D{{Key: "swappedAt", Value: 1}}},
		{"run_sessions", "idx_run_sessions_updated", bson.D{{Key: "updatedAt", Value: 1}}},
		{"run_programs", "idx_run_programs_updated", bson.D{{Key: "updatedAt", Value: 1}}},
	}

	for _, sp := range specs {
		model := mongo.IndexModel{
			Keys:    sp.keys,
			Options: options.Index().SetName(sp.name),
		}
		if _, err := db.Collection(sp.coll).Indexes().CreateOne(ctx, model); err != nil {
			return fmt.Errorf("index %s on %s: %w", sp.name, sp.coll, err)
		}
	}
	return nil
}

// ── Upsert helpers ────────────────────────────────────────────────────────────

// lwwField builds an aggregation pipeline expression that replaces field with
// newVal only when effectiveUpdatedAt > existing updatedAt (or on initial insert).
func lwwField(field string, newVal any, effectiveUpdatedAt int64) bson.M {
	return bson.M{
		"$cond": bson.A{
			bson.M{"$gt": bson.A{effectiveUpdatedAt, bson.M{"$ifNull": bson.A{"$updatedAt", int64(-1)}}}},
			newVal,
			"$" + field,
		},
	}
}

// initOnlyField preserves existing field value on update, setting it only when
// the document is first inserted.
func initOnlyField(field string, newVal any) bson.M {
	return bson.M{
		"$ifNull": bson.A{"$" + field, newVal},
	}
}

// upsertRoutine writes r to DB. serverNow ensures pushed records are always
// visible to subsequent delta fetches (updatedAt >= server receipt time).
func upsertRoutine(s *Store, r Routine, serverNow int64) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	effectiveUpdatedAt := max(r.UpdatedAt, serverNow)
	exercises := r.Exercises
	if exercises == nil {
		exercises = []RoutineExercise{}
	}

	pipeline := mongo.Pipeline{
		{{Key: "$set", Value: bson.M{
			"name":      lwwField("name", r.Name, effectiveUpdatedAt),
			"splitDay":  lwwField("splitDay", r.SplitDay, effectiveUpdatedAt),
			"exercises": lwwField("exercises", exercises, effectiveUpdatedAt),
			"createdAt": initOnlyField("createdAt", r.CreatedAt),
			"updatedAt": lwwField("updatedAt", effectiveUpdatedAt, effectiveUpdatedAt),
		}}},
	}

	_, err := s.DB.Collection("routines").UpdateOne(
		ctx,
		bson.M{"_id": r.ID},
		pipeline,
		options.UpdateOne().SetUpsert(true),
	)
	return err
}

func upsertSession(s *Store, sess WorkoutSession, serverNow int64) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	effectiveUpdatedAt := max(sess.UpdatedAt, serverNow)
	pipeline := mongo.Pipeline{
		{{Key: "$set", Value: bson.M{
			"routineId":      initOnlyField("routineId", sess.RoutineID),
			"routineName":    initOnlyField("routineName", sess.RoutineName),
			"splitDay":       initOnlyField("splitDay", sess.SplitDay),
			"startedAt":      initOnlyField("startedAt", sess.StartedAt),
			"completedAt":    lwwField("completedAt", sess.CompletedAt, effectiveUpdatedAt),
			"notes":          lwwField("notes", sess.Notes, effectiveUpdatedAt),
			"mesocycleId":    lwwField("mesocycleId", sess.MesocycleID, effectiveUpdatedAt),
			"isDeload":       lwwField("isDeload", sess.IsDeload, effectiveUpdatedAt),
			"swaps":          lwwField("swaps", sess.Swaps, effectiveUpdatedAt),
			"extraExercises": lwwField("extraExercises", sess.ExtraExercises, effectiveUpdatedAt),
			"updatedAt":      lwwField("updatedAt", effectiveUpdatedAt, effectiveUpdatedAt),
		}}},
	}

	_, err := s.DB.Collection("sessions").UpdateOne(
		ctx,
		bson.M{"_id": sess.ID},
		pipeline,
		options.UpdateOne().SetUpsert(true),
	)
	return err
}

func upsertSet(s *Store, set SetLog, serverNow int64) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	effectiveUpdatedAt := max(set.UpdatedAt, serverNow)
	setType := set.SetType
	if setType == "" {
		setType = "work"
	}

	pipeline := mongo.Pipeline{
		{{Key: "$set", Value: bson.M{
			"sessionId":    initOnlyField("sessionId", set.SessionID),
			"exerciseId":   initOnlyField("exerciseId", set.ExerciseID),
			"exerciseName": initOnlyField("exerciseName", set.ExerciseName),
			"setNumber":    initOnlyField("setNumber", set.SetNumber),
			"timestamp":    initOnlyField("timestamp", set.Timestamp),
			"reps":         lwwField("reps", set.Reps, effectiveUpdatedAt),
			"weightKg":     lwwField("weightKg", set.WeightKg, effectiveUpdatedAt),
			"rpe":          lwwField("rpe", set.RPE, effectiveUpdatedAt),
			"setType":      lwwField("setType", setType, effectiveUpdatedAt),
			"volume":       lwwField("volume", set.Volume, effectiveUpdatedAt),
			"updatedAt":    lwwField("updatedAt", effectiveUpdatedAt, effectiveUpdatedAt),
		}}},
	}

	_, err := s.DB.Collection("sets").UpdateOne(
		ctx,
		bson.M{"_id": set.ID},
		pipeline,
		options.UpdateOne().SetUpsert(true),
	)
	return err
}

func upsertMesocycle(s *Store, m Mesocycle, serverNow int64) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	effectiveUpdatedAt := max(m.UpdatedAt, serverNow)
	targetWeeks := m.TargetWeeks
	if targetWeeks == 0 {
		targetWeeks = 5
	}

	pipeline := mongo.Pipeline{
		{{Key: "$set", Value: bson.M{
			"number":       initOnlyField("number", m.Number),
			"targetWeeks":  initOnlyField("targetWeeks", targetWeeks),
			"startedAt":    initOnlyField("startedAt", m.StartedAt),
			"name":         lwwField("name", m.Name, effectiveUpdatedAt),
			"endedAt":      lwwField("endedAt", m.EndedAt, effectiveUpdatedAt),
			"isDeloadWeek": lwwField("isDeloadWeek", m.IsDeloadWeek, effectiveUpdatedAt),
			"updatedAt":    lwwField("updatedAt", effectiveUpdatedAt, effectiveUpdatedAt),
		}}},
	}

	_, err := s.DB.Collection("mesocycles").UpdateOne(
		ctx,
		bson.M{"_id": m.ID},
		pipeline,
		options.UpdateOne().SetUpsert(true),
	)
	return err
}

func upsertExerciseSwap(s *Store, sw ExerciseSwap) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := s.DB.Collection("exercise_swaps").UpdateOne(
		ctx,
		bson.M{"_id": sw.ID},
		bson.M{"$setOnInsert": bson.M{
			"mesocycleId":       sw.MesocycleID,
			"routineId":         sw.RoutineID,
			"removedExerciseId": sw.RemovedExerciseID,
			"addedExerciseId":   sw.AddedExerciseID,
			"swappedAt":         sw.SwappedAt,
		}},
		options.UpdateOne().SetUpsert(true),
	)
	return err
}

func upsertRunSession(s *Store, rs RunSession, serverNow int64) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	effectiveUpdatedAt := max(rs.UpdatedAt, serverNow)
	pipeline := mongo.Pipeline{
		{{Key: "$set", Value: bson.M{
			"week":        initOnlyField("week", rs.Week),
			"day":         initOnlyField("day", rs.Day),
			"startedAt":   initOnlyField("startedAt", rs.StartedAt),
			"completedAt": lwwField("completedAt", rs.CompletedAt, effectiveUpdatedAt),
			"durationSec": lwwField("durationSec", rs.DurationSec, effectiveUpdatedAt),
			"distanceKm":  lwwField("distanceKm", rs.DistanceKm, effectiveUpdatedAt),
			"rpe":         lwwField("rpe", rs.RPE, effectiveUpdatedAt),
			"updatedAt":   lwwField("updatedAt", effectiveUpdatedAt, effectiveUpdatedAt),
		}}},
	}

	_, err := s.DB.Collection("run_sessions").UpdateOne(
		ctx,
		bson.M{"_id": rs.ID},
		pipeline,
		options.UpdateOne().SetUpsert(true),
	)
	return err
}

func upsertRunProgram(s *Store, rp RunProgram, serverNow int64) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	effectiveUpdatedAt := max(rp.UpdatedAt, serverNow)
	pipeline := mongo.Pipeline{
		{{Key: "$set", Value: bson.M{
			"number":    lwwField("number", rp.Number, effectiveUpdatedAt),
			"startedAt": lwwField("startedAt", rp.StartedAt, effectiveUpdatedAt),
			"endedAt":   lwwField("endedAt", rp.EndedAt, effectiveUpdatedAt),
			"updatedAt": lwwField("updatedAt", effectiveUpdatedAt, effectiveUpdatedAt),
		}}},
	}

	_, err := s.DB.Collection("run_programs").UpdateOne(
		ctx,
		bson.M{"_id": rp.ID},
		pipeline,
		options.UpdateOne().SetUpsert(true),
	)
	return err
}

// ── Fetch since ───────────────────────────────────────────────────────────────

func findSince[T any](s *Store, coll, tsField string, since int64) ([]T, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cursor, err := s.DB.Collection(coll).Find(ctx, bson.M{tsField: bson.M{"$gt": since}})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var out []T
	if err := cursor.All(ctx, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func fetchRoutinesSince(s *Store, since int64) ([]Routine, error) {
	return findSince[Routine](s, "routines", "updatedAt", since)
}

func fetchSessionsSince(s *Store, since int64) ([]WorkoutSession, error) {
	return findSince[WorkoutSession](s, "sessions", "updatedAt", since)
}

func fetchSetsSince(s *Store, since int64) ([]SetLog, error) {
	return findSince[SetLog](s, "sets", "updatedAt", since)
}

func fetchMesocyclesSince(s *Store, since int64) ([]Mesocycle, error) {
	return findSince[Mesocycle](s, "mesocycles", "updatedAt", since)
}

func fetchExerciseSwapsSince(s *Store, since int64) ([]ExerciseSwap, error) {
	return findSince[ExerciseSwap](s, "exercise_swaps", "swappedAt", since)
}

func fetchRunSessionsSince(s *Store, since int64) ([]RunSession, error) {
	return findSince[RunSession](s, "run_sessions", "updatedAt", since)
}

func fetchRunProgramsSince(s *Store, since int64) ([]RunProgram, error) {
	return findSince[RunProgram](s, "run_programs", "updatedAt", since)
}

func UpsertSync(s *Store, p SyncPayload, now ...int64) (SyncResponse, error) {
	serverNow := nowMs()
	if len(now) > 0 {
		serverNow = now[0]
	}

	for _, routine := range p.Routines {
		if err := upsertRoutine(s, routine, serverNow); err != nil {
			log.Printf("upsert routine %s: %v", routine.ID, err)
		}
	}
	for _, sess := range p.Sessions {
		if err := upsertSession(s, sess, serverNow); err != nil {
			log.Printf("upsert session %s: %v", sess.ID, err)
		}
	}
	for _, set := range p.Sets {
		if err := upsertSet(s, set, serverNow); err != nil {
			log.Printf("upsert set %s: %v", set.ID, err)
		}
	}
	for _, m := range p.Mesocycles {
		if err := upsertMesocycle(s, m, serverNow); err != nil {
			log.Printf("upsert mesocycle %s: %v", m.ID, err)
		}
	}
	for _, sw := range p.ExerciseSwaps {
		if err := upsertExerciseSwap(s, sw); err != nil {
			log.Printf("upsert exercise_swap %s: %v", sw.ID, err)
		}
	}
	for _, rs := range p.RunSessions {
		if err := upsertRunSession(s, rs, serverNow); err != nil {
			log.Printf("upsert run_session %s: %v", rs.ID, err)
		}
	}
	for _, rp := range p.RunPrograms {
		if err := upsertRunProgram(s, rp, serverNow); err != nil {
			log.Printf("upsert run_program %s: %v", rp.ID, err)
		}
	}

	routines, err := fetchRoutinesSince(s, p.LastSyncAt)
	if err != nil {
		log.Printf("fetch routines: %v", err)
	}
	sessions, err := fetchSessionsSince(s, p.LastSyncAt)
	if err != nil {
		log.Printf("fetch sessions: %v", err)
	}
	sets, err := fetchSetsSince(s, p.LastSyncAt)
	if err != nil {
		log.Printf("fetch sets: %v", err)
	}
	mesocycles, err := fetchMesocyclesSince(s, p.LastSyncAt)
	if err != nil {
		log.Printf("fetch mesocycles: %v", err)
	}
	exerciseSwaps, err := fetchExerciseSwapsSince(s, p.LastSyncAt)
	if err != nil {
		log.Printf("fetch exercise_swaps: %v", err)
	}
	runSessions, err := fetchRunSessionsSince(s, p.LastSyncAt)
	if err != nil {
		log.Printf("fetch run_sessions: %v", err)
	}
	runPrograms, err := fetchRunProgramsSince(s, p.LastSyncAt)
	if err != nil {
		log.Printf("fetch run_programs: %v", err)
	}

	if routines == nil {
		routines = []Routine{}
	}
	if sessions == nil {
		sessions = []WorkoutSession{}
	}
	if sets == nil {
		sets = []SetLog{}
	}
	if mesocycles == nil {
		mesocycles = []Mesocycle{}
	}
	if exerciseSwaps == nil {
		exerciseSwaps = []ExerciseSwap{}
	}
	if runSessions == nil {
		runSessions = []RunSession{}
	}
	if runPrograms == nil {
		runPrograms = []RunProgram{}
	}

	return SyncResponse{
		SyncedAt:      serverNow,
		Routines:      routines,
		Sessions:      sessions,
		Sets:          sets,
		Mesocycles:    mesocycles,
		ExerciseSwaps: exerciseSwaps,
		RunSessions:   runSessions,
		RunPrograms:   runPrograms,
	}, nil
}

func nowMs() int64 { return time.Now().UnixMilli() }
