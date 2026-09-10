package dashboard

import "context"

// TopologyData represents the complete system topology, model routing pools, and worker health.
type TopologyData struct {
	Mode             string          `json:"mode"`               // "proxy" or "run"
	Policy           string          `json:"policy"`             // "consistent_hash", "round_robin", etc.
	PublicAddr       string          `json:"public_addr"`        // e.g. "0.0.0.0:8000"
	ClusterHealth    string          `json:"cluster_health"`     // "healthy", "degraded", "unhealthy"
	TotalModels      int             `json:"total_models"`       // Total active models
	TotalWorkers     int             `json:"total_workers"`      // Total worker instances
	HealthyWorkers   int             `json:"healthy_workers"`    // Healthy worker instances
	TotalActiveConns int64           `json:"total_active_conns"` // In-flight active connections across cluster
	Models           []ModelTopology `json:"models"`             // Per-model routing topology
	ServerTimeUTC    string          `json:"server_time_utc"`    // RFC3339 timestamp
}

// ModelTopology represents the load and worker topology for a specific model pool.
type ModelTopology struct {
	ModelName    string           `json:"model_name"`
	Policy       string           `json:"policy"`
	WorkerCount  int              `json:"worker_count"`
	HealthyCount int              `json:"healthy_count"`
	ActiveConns  int64            `json:"active_conns"`
	Workers      []WorkerTopology `json:"workers"`
}

// WorkerTopology represents the real-time load, health, and circuit breaker status of a backend worker.
type WorkerTopology struct {
	URL                 string `json:"url"`
	ActiveConns         int64  `json:"active_conns"`
	Healthy             bool   `json:"healthy"`
	CircuitState        string `json:"circuit_state"` // "CLOSED", "OPEN", "HALF_OPEN"
	ConsecutiveFailures int    `json:"consecutive_failures"`
	LastErr             string `json:"last_error,omitempty"`
	LastProbe           string `json:"last_probe,omitempty"`
}

// ProbeRequest represents the payload for triggering a manual worker probe.
type ProbeRequest struct {
	URL string `json:"url"`
}

// ProbeResponse represents the result of a manual worker probe.
type ProbeResponse struct {
	URL     string `json:"url"`
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// ResetBreakerRequest represents the payload for resetting a circuit breaker.
type ResetBreakerRequest struct {
	URL string `json:"url"`
}

// ResetBreakerResponse represents the result of resetting a circuit breaker.
type ResetBreakerResponse struct {
	URL     string `json:"url"`
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// TopologyProvider is implemented by both Proxy Server (mode: proxy) and Supervisor (mode: run).
type TopologyProvider interface {
	GetTopology(ctx context.Context) (*TopologyData, error)
	ProbeWorker(ctx context.Context, workerURL string) (bool, error)
	ResetBreaker(ctx context.Context, workerURL string) error
}
