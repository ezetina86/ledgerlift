package main

// Mirror of frontend TypeScript types.

type RoutineExercise struct {
	ExerciseID  string `json:"exerciseId"`
	Order       int    `json:"order"`
	DefaultSets int    `json:"defaultSets"`
	DefaultReps string `json:"defaultReps"`
}

type Routine struct {
	ID        string            `json:"id"`
	Name      string            `json:"name"`
	SplitDay  string            `json:"splitDay"`
	Exercises []RoutineExercise `json:"exercises"`
	CreatedAt int64             `json:"createdAt"`
	UpdatedAt int64             `json:"updatedAt"`
}

type WorkoutSession struct {
	ID           string  `json:"id"`
	RoutineID    string  `json:"routineId"`
	RoutineName  string  `json:"routineName"`
	SplitDay     string  `json:"splitDay"`
	StartedAt    int64   `json:"startedAt"`
	CompletedAt  *int64  `json:"completedAt"`
	Notes        string  `json:"notes"`
	MesocycleID  *string `json:"mesocycleId"`
	IsDeload     bool    `json:"isDeload"`
	UpdatedAt    int64   `json:"updatedAt"`
}

type Mesocycle struct {
	ID           string  `json:"id"`
	Number       int     `json:"number"`
	Name         string  `json:"name"`
	TargetWeeks  int     `json:"targetWeeks"`
	StartedAt    int64   `json:"startedAt"`
	EndedAt      *int64  `json:"endedAt"`
	IsDeloadWeek bool    `json:"isDeloadWeek"`
	UpdatedAt    int64   `json:"updatedAt"`
}

type ExerciseSwap struct {
	ID                string `json:"id"`
	MesocycleID       string `json:"mesocycleId"`
	RoutineID         string `json:"routineId"`
	RemovedExerciseID string `json:"removedExerciseId"`
	AddedExerciseID   string `json:"addedExerciseId"`
	SwappedAt         int64  `json:"swappedAt"`
}

type SetLog struct {
	ID           string   `json:"id"`
	SessionID    string   `json:"sessionId"`
	ExerciseID   string   `json:"exerciseId"`
	ExerciseName string   `json:"exerciseName"`
	SetNumber    int      `json:"setNumber"`
	Reps         int      `json:"reps"`
	WeightKg     float64  `json:"weightKg"`
	RPE          *float64 `json:"rpe"`
	Volume       float64  `json:"volume"`
	Timestamp    int64    `json:"timestamp"`
	UpdatedAt    int64    `json:"updatedAt"`
}

type RunSession struct {
	ID          string   `json:"id"`
	Week        int      `json:"week"`
	Day         int      `json:"day"`
	StartedAt   int64    `json:"startedAt"`
	CompletedAt *int64   `json:"completedAt"`
	DurationSec *int64   `json:"durationSec"`
	DistanceKm  *float64 `json:"distanceKm"`
	RPE         *float64 `json:"rpe"`
	UpdatedAt   int64    `json:"updatedAt"`
}

// Sync request/response

type SyncRequest struct {
	LastSyncAt    int64            `json:"lastSyncAt"`
	Sessions      []WorkoutSession `json:"sessions"`
	Sets          []SetLog         `json:"sets"`
	Routines      []Routine        `json:"routines"`
	Mesocycles    []Mesocycle      `json:"mesocycles"`
	ExerciseSwaps []ExerciseSwap   `json:"exerciseSwaps"`
	RunSessions   []RunSession     `json:"runSessions"`
}

type SyncResponse struct {
	SyncedAt      int64            `json:"syncedAt"`
	Sessions      []WorkoutSession `json:"sessions"`
	Sets          []SetLog         `json:"sets"`
	Routines      []Routine        `json:"routines"`
	Mesocycles    []Mesocycle      `json:"mesocycles"`
	ExerciseSwaps []ExerciseSwap   `json:"exerciseSwaps"`
	RunSessions   []RunSession     `json:"runSessions"`
}
