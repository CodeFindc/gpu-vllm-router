package proxy

import (
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"
)

// CircuitState represents the current state of a circuit breaker.
type CircuitState string

const (
	StateClosed   CircuitState = "CLOSED"    // Healthy, normal traffic
	StateOpen     CircuitState = "OPEN"      // Tripped/Isolating, traffic blocked
	StateHalfOpen CircuitState = "HALF_OPEN" // Trial state, probing health
)

// CircuitBreakerConfig sets thresholds for a target circuit breaker.
type CircuitBreakerConfig struct {
	MaxFailures         int           // Consecutive failures to trip (default: 3)
	Cooldown            time.Duration // Time to remain in OPEN before transitioning to HALF_OPEN (default: 10s)
	MaxRetries          int           // Number of retries on alternative backends upon failure (default: 2)
	HealthCheckInterval time.Duration // Interval for probing tripped endpoints (default: 3s)
}

// DefaultCircuitBreakerConfig provides sensible production defaults.
func DefaultCircuitBreakerConfig() CircuitBreakerConfig {
	return CircuitBreakerConfig{
		MaxFailures:         3,
		Cooldown:            10 * time.Second,
		MaxRetries:          2,
		HealthCheckInterval: 3 * time.Second,
	}
}

// CircuitBreaker manages fault tolerance and failure isolation for a single backend endpoint.
type CircuitBreaker struct {
	mu                  sync.RWMutex
	targetURL           string
	cfg                 CircuitBreakerConfig
	state               CircuitState
	consecutiveFailures int
	totalFailures       int64
	totalSuccesses      int64
	lastStateChange     time.Time
	lastFailureTime     time.Time
	httpClient          *http.Client
}

// NewCircuitBreaker creates a new CircuitBreaker for a given backend URL.
func NewCircuitBreaker(targetURL string, cfg CircuitBreakerConfig) *CircuitBreaker {
	if cfg.MaxFailures <= 0 {
		cfg.MaxFailures = 3
	}
	if cfg.Cooldown <= 0 {
		cfg.Cooldown = 10 * time.Second
	}
	if cfg.HealthCheckInterval <= 0 {
		cfg.HealthCheckInterval = 3 * time.Second
	}
	if cfg.MaxRetries < 0 {
		cfg.MaxRetries = 2
	}

	return &CircuitBreaker{
		targetURL:       targetURL,
		cfg:             cfg,
		state:           StateClosed,
		lastStateChange: time.Now(),
		httpClient: &http.Client{
			Timeout: 2 * time.Second,
		},
	}
}

// CanExecute returns true if requests should be allowed through to the target.
func (cb *CircuitBreaker) CanExecute() bool {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	switch cb.state {
	case StateClosed:
		return true
	case StateOpen:
		// Check if cooldown has elapsed
		if time.Since(cb.lastStateChange) >= cb.cfg.Cooldown {
			cb.state = StateHalfOpen
			cb.lastStateChange = time.Now()
			log.Printf("[CircuitBreaker] Target %s cooldown (%v) elapsed -> entering HALF_OPEN (trial probing)",
				cb.targetURL, cb.cfg.Cooldown)
			return true
		}
		return false
	case StateHalfOpen:
		// In half-open, allow trial request
		return true
	default:
		return true
	}
}

// RecordSuccess registers a successful response from the backend.
func (cb *CircuitBreaker) RecordSuccess() {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	cb.totalSuccesses++
	cb.consecutiveFailures = 0

	if cb.state == StateHalfOpen || cb.state == StateOpen {
		cb.state = StateClosed
		cb.lastStateChange = time.Now()
		log.Printf("[CircuitBreaker] 🟢 Target %s healthy! Restored to CLOSED", cb.targetURL)
	}
}

// RecordFailure registers a communication or HTTP 5xx failure from the backend.
func (cb *CircuitBreaker) RecordFailure(err error) {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	cb.totalFailures++
	cb.consecutiveFailures++
	cb.lastFailureTime = time.Now()

	log.Printf("[CircuitBreaker] Target %s failure #%d: %v", cb.targetURL, cb.consecutiveFailures, err)

	if cb.state == StateHalfOpen {
		// Half-open trial failed, immediate trip back to Open
		cb.state = StateOpen
		cb.lastStateChange = time.Now()
		log.Printf("[CircuitBreaker] Target %s failed during HALF_OPEN trial -> back to OPEN (isolated for %v)",
			cb.targetURL, cb.cfg.Cooldown)
		return
	}

	if cb.state == StateClosed && cb.consecutiveFailures >= cb.cfg.MaxFailures {
		cb.state = StateOpen
		cb.lastStateChange = time.Now()
		log.Printf("[CircuitBreaker] 🔴 Target %s reached %d consecutive failures -> TRIPPED OPEN! Node isolated for %v",
			cb.targetURL, cb.consecutiveFailures, cb.cfg.Cooldown)
	}
}

// GetStatus returns the current status snapshot of the circuit breaker.
func (cb *CircuitBreaker) GetStatus() (state CircuitState, consecutiveFails int, lastChange time.Time) {
	cb.mu.RLock()
	defer cb.mu.RUnlock()
	return cb.state, cb.consecutiveFailures, cb.lastStateChange
}

// GetMetrics returns detailed execution counters for Prometheus export.
func (cb *CircuitBreaker) GetMetrics() (state CircuitState, consecutiveFails int, totalSuccess, totalFails int64) {
	cb.mu.RLock()
	defer cb.mu.RUnlock()
	return cb.state, cb.consecutiveFailures, cb.totalSuccesses, cb.totalFailures
}

// Probe actively tests the health of the target via /health or /v1/models.
func (cb *CircuitBreaker) Probe() bool {
	probeURL := fmt.Sprintf("%s/health", cb.targetURL)
	req, err := http.NewRequest(http.MethodGet, probeURL, nil)
	if err != nil {
		return false
	}

	resp, err := cb.httpClient.Do(req)
	if err == nil {
		resp.Body.Close()
		if resp.StatusCode == http.StatusOK {
			cb.RecordSuccess()
			return true
		}
	}

	// Fallback to /v1/models
	modelsURL := fmt.Sprintf("%s/v1/models", cb.targetURL)
	req2, err := http.NewRequest(http.MethodGet, modelsURL, nil)
	if err != nil {
		return false
	}
	resp2, err := cb.httpClient.Do(req2)
	if err == nil {
		resp2.Body.Close()
		if resp2.StatusCode == http.StatusOK {
			cb.RecordSuccess()
			return true
		}
	}

	return false
}
