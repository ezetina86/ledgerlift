package main

// Mirror of frontend TypeScript types.

type RoutineExercise struct {
	ExerciseID        string   `json:"exerciseId" bson:"exerciseId"`
	Order             int      `json:"order" bson:"order"`
	DefaultSets       int      `json:"defaultSets" bson:"defaultSets"`
	DefaultReps       string   `json:"defaultReps" bson:"defaultReps"`
	BackupExerciseIDs []string `json:"backupExerciseIds,omitempty" bson:"backupExerciseIds,omitempty"`
}

type Routine struct {
	ID        string            `json:"id" bson:"_id"`
	Name      string            `json:"name" bson:"name"`
	SplitDay  string            `json:"splitDay" bson:"splitDay"`
	Exercises []RoutineExercise `json:"exercises" bson:"exercises"`
	CreatedAt int64             `json:"createdAt" bson:"createdAt"`
	UpdatedAt int64             `json:"updatedAt" bson:"updatedAt"`
}

type WorkoutSession struct {
	ID             string            `json:"id" bson:"_id"`
	RoutineID      string            `json:"routineId" bson:"routineId"`
	RoutineName    string            `json:"routineName" bson:"routineName"`
	SplitDay       string            `json:"splitDay" bson:"splitDay"`
	StartedAt      int64             `json:"startedAt" bson:"startedAt"`
	CompletedAt    *int64            `json:"completedAt" bson:"completedAt"`
	Notes          string            `json:"notes" bson:"notes"`
	MesocycleID    *string           `json:"mesocycleId" bson:"mesocycleId"`
	IsDeload       bool              `json:"isDeload" bson:"isDeload"`
	Swaps          map[string]string `json:"swaps,omitempty" bson:"swaps,omitempty"`
	ExtraExercises []RoutineExercise `json:"extraExercises,omitempty" bson:"extraExercises,omitempty"`
	UpdatedAt      int64             `json:"updatedAt" bson:"updatedAt"`
}

type Mesocycle struct {
	ID           string `json:"id" bson:"_id"`
	Number       int    `json:"number" bson:"number"`
	Name         string `json:"name" bson:"name"`
	TargetWeeks  int    `json:"targetWeeks" bson:"targetWeeks"`
	StartedAt    int64  `json:"startedAt" bson:"startedAt"`
	EndedAt      *int64 `json:"endedAt" bson:"endedAt"`
	IsDeloadWeek bool   `json:"isDeloadWeek" bson:"isDeloadWeek"`
	UpdatedAt    int64  `json:"updatedAt" bson:"updatedAt"`
}

type ExerciseSwap struct {
	ID                string `json:"id" bson:"_id"`
	MesocycleID       string `json:"mesocycleId" bson:"mesocycleId"`
	RoutineID         string `json:"routineId" bson:"routineId"`
	RemovedExerciseID string `json:"removedExerciseId" bson:"removedExerciseId"`
	AddedExerciseID   string `json:"addedExerciseId" bson:"addedExerciseId"`
	SwappedAt         int64  `json:"swappedAt" bson:"swappedAt"`
}

type SetLog struct {
	ID           string   `json:"id" bson:"_id"`
	SessionID    string   `json:"sessionId" bson:"sessionId"`
	ExerciseID   string   `json:"exerciseId" bson:"exerciseId"`
	ExerciseName string   `json:"exerciseName" bson:"exerciseName"`
	SetNumber    int      `json:"setNumber" bson:"setNumber"`
	Reps         int      `json:"reps" bson:"reps"`
	WeightKg     float64  `json:"weightKg" bson:"weightKg"`
	RPE          *float64 `json:"rpe" bson:"rpe"`
	SetType      string   `json:"setType,omitempty" bson:"setType,omitempty"`
	Volume       float64  `json:"volume" bson:"volume"`
	Timestamp    int64    `json:"timestamp" bson:"timestamp"`
	UpdatedAt    int64    `json:"updatedAt" bson:"updatedAt"`
}

type RunSession struct {
	ID          string   `json:"id" bson:"_id"`
	Week        int      `json:"week" bson:"week"`
	Day         int      `json:"day" bson:"day"`
	StartedAt   int64    `json:"startedAt" bson:"startedAt"`
	CompletedAt *int64   `json:"completedAt" bson:"completedAt"`
	DurationSec *int64   `json:"durationSec" bson:"durationSec"`
	DistanceKm  *float64 `json:"distanceKm" bson:"distanceKm"`
	RPE         *float64 `json:"rpe" bson:"rpe"`
	UpdatedAt   int64    `json:"updatedAt" bson:"updatedAt"`
}

type RunProgram struct {
	ID        string `json:"id" bson:"_id"`
	Number    int    `json:"number" bson:"number"`
	StartedAt int64  `json:"startedAt" bson:"startedAt"`
	EndedAt   *int64 `json:"endedAt" bson:"endedAt"`
	UpdatedAt int64  `json:"updatedAt" bson:"updatedAt"`
}

// Sync request/response

type SyncPayload = SyncRequest

type SyncRequest struct {
	LastSyncAt    int64            `json:"lastSyncAt"`
	Sessions      []WorkoutSession `json:"sessions"`
	Sets          []SetLog         `json:"sets"`
	Routines      []Routine        `json:"routines"`
	Mesocycles    []Mesocycle      `json:"mesocycles"`
	ExerciseSwaps []ExerciseSwap   `json:"exerciseSwaps"`
	RunSessions   []RunSession     `json:"runSessions"`
	RunPrograms   []RunProgram     `json:"runPrograms"`
}

type SyncResponse struct {
	SyncedAt      int64            `json:"syncedAt"`
	Sessions      []WorkoutSession `json:"sessions"`
	Sets          []SetLog         `json:"sets"`
	Routines      []Routine        `json:"routines"`
	Mesocycles    []Mesocycle      `json:"mesocycles"`
	ExerciseSwaps []ExerciseSwap   `json:"exerciseSwaps"`
	RunSessions   []RunSession     `json:"runSessions"`
	RunPrograms   []RunProgram     `json:"runPrograms"`
}
