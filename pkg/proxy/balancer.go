package proxy

import (
	"bytes"
	"encoding/json"
	"errors"
	"hash/fnv"
	"io"
	"math/rand"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"sync"
	"sync/atomic"

	"gpu-vllm-router/pkg/router"
)

// BackendTarget represents a single worker node endpoint.
type BackendTarget struct {
	URL         *url.URL
	URLString   string
	ActiveConns int64
	Healthy     bool
}

// Balancer is the interface for load balancing algorithms.
type Balancer interface {
	SelectTarget(r *http.Request) (*BackendTarget, error)
	SetTargets(targets []*BackendTarget)
	GetTargets() []*BackendTarget
	RecordRequestStart(target *BackendTarget)
	RecordRequestEnd(target *BackendTarget)
}

// BaseBalancer provides common target management.
type BaseBalancer struct {
	mu      sync.RWMutex
	targets []*BackendTarget
}

func (b *BaseBalancer) SetTargets(targets []*BackendTarget) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.targets = targets
}

func (b *BaseBalancer) GetTargets() []*BackendTarget {
	b.mu.RLock()
	defer b.mu.RUnlock()
	res := make([]*BackendTarget, len(b.targets))
	copy(res, b.targets)
	return res
}

func (b *BaseBalancer) RecordRequestStart(target *BackendTarget) {
	atomic.AddInt64(&target.ActiveConns, 1)
}

func (b *BaseBalancer) RecordRequestEnd(target *BackendTarget) {
	atomic.AddInt64(&target.ActiveConns, -1)
}

// --- Round Robin Balancer ---

type RoundRobinBalancer struct {
	BaseBalancer
	counter uint64
}

func NewRoundRobinBalancer(targets []*BackendTarget) *RoundRobinBalancer {
	b := &RoundRobinBalancer{}
	b.SetTargets(targets)
	return b
}

func (b *RoundRobinBalancer) SelectTarget(r *http.Request) (*BackendTarget, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if len(b.targets) == 0 {
		return nil, errors.New("no healthy backends available")
	}

	idx := atomic.AddUint64(&b.counter, 1) % uint64(len(b.targets))
	return b.targets[idx], nil
}

// --- Random Balancer ---

type RandomBalancer struct {
	BaseBalancer
}

func NewRandomBalancer(targets []*BackendTarget) *RandomBalancer {
	b := &RandomBalancer{}
	b.SetTargets(targets)
	return b
}

func (b *RandomBalancer) SelectTarget(r *http.Request) (*BackendTarget, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if len(b.targets) == 0 {
		return nil, errors.New("no healthy backends available")
	}

	idx := rand.Intn(len(b.targets))
	return b.targets[idx], nil
}

// --- Power of Two Choices (P2C) Balancer ---

type PowerOfTwoBalancer struct {
	BaseBalancer
}

func NewPowerOfTwoBalancer(targets []*BackendTarget) *PowerOfTwoBalancer {
	b := &PowerOfTwoBalancer{}
	b.SetTargets(targets)
	return b
}

func (b *PowerOfTwoBalancer) SelectTarget(r *http.Request) (*BackendTarget, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	n := len(b.targets)
	if n == 0 {
		return nil, errors.New("no healthy backends available")
	}
	if n == 1 {
		return b.targets[0], nil
	}

	// Pick two distinct random indices
	i1 := rand.Intn(n)
	i2 := rand.Intn(n - 1)
	if i2 >= i1 {
		i2++
	}

	t1 := b.targets[i1]
	t2 := b.targets[i2]

	// Choose the one with fewer active connections
	if atomic.LoadInt64(&t1.ActiveConns) <= atomic.LoadInt64(&t2.ActiveConns) {
		return t1, nil
	}
	return t2, nil
}

// --- Consistent Hash Balancer ---

type ConsistentHashBalancer struct {
	BaseBalancer
	virtualNodes int
	ring         []uint32
	ringMap      map[uint32]*BackendTarget
}

func NewConsistentHashBalancer(targets []*BackendTarget, virtualNodes int) *ConsistentHashBalancer {
	if virtualNodes <= 0 {
		virtualNodes = 100
	}
	b := &ConsistentHashBalancer{
		virtualNodes: virtualNodes,
		ringMap:      make(map[uint32]*BackendTarget),
	}
	b.SetTargets(targets)
	return b
}

func (b *ConsistentHashBalancer) SetTargets(targets []*BackendTarget) {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.targets = targets
	b.ring = nil
	b.ringMap = make(map[uint32]*BackendTarget)

	for _, t := range targets {
		for i := 0; i < b.virtualNodes; i++ {
			vKey := t.URLString + "#" + strconv.Itoa(i)
			h := hashKey(vKey)
			b.ring = append(b.ring, h)
			b.ringMap[h] = t
		}
	}
	sort.Slice(b.ring, func(i, j int) bool { return b.ring[i] < b.ring[j] })
}

func (b *ConsistentHashBalancer) SelectTarget(r *http.Request) (*BackendTarget, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if len(b.targets) == 0 || len(b.ring) == 0 {
		return nil, errors.New("no healthy backends available")
	}

	key := extractSessionKey(r)
	h := hashKey(key)

	// Binary search for first ring node >= h
	idx := sort.Search(len(b.ring), func(i int) bool { return b.ring[i] >= h })
	if idx >= len(b.ring) {
		idx = 0
	}

	return b.ringMap[b.ring[idx]], nil
}

func hashKey(s string) uint32 {
	h := fnv.New32a()
	_, _ = h.Write([]byte(s))
	return h.Sum32()
}

// extractSessionKey extracts session/user identifier matching vllm-router priority.
func extractSessionKey(r *http.Request) string {
	// Priority 1-4: Standard Headers
	if val := r.Header.Get("X-Session-ID"); val != "" {
		return val
	}
	if val := r.Header.Get("X-User-ID"); val != "" {
		return val
	}
	if val := r.Header.Get("X-Tenant-ID"); val != "" {
		return val
	}
	if val := r.Header.Get("X-Request-ID"); val != "" {
		return val
	}

	// Priority 5: If JSON body is present, attempt to extract user or session_params
	if r.Body != nil && (r.Method == http.MethodPost || r.Method == http.MethodPut) {
		bodyBytes, err := io.ReadAll(r.Body)
		if err == nil {
			// Restore request body for downstream handler
			r.Body = io.NopCloser(bytes.NewReader(bodyBytes))

			var reqMap map[string]interface{}
			if err := json.Unmarshal(bodyBytes, &reqMap); err == nil {
				if user, ok := reqMap["user"].(string); ok && user != "" {
					return user
				}
				if sParams, ok := reqMap["session_params"].(map[string]interface{}); ok {
					if sid, ok := sParams["session_id"].(string); ok && sid != "" {
						return sid
					}
				}
				if sid, ok := reqMap["session_id"].(string); ok && sid != "" {
					return sid
				}
			}
		}
	}

	// Fallback: Remote address
	return r.RemoteAddr
}

// NewBalancer creates a Balancer based on Policy.
func NewBalancer(policy router.Policy, targets []*BackendTarget) Balancer {
	switch policy {
	case router.PolicyRoundRobin:
		return NewRoundRobinBalancer(targets)
	case router.PolicyRandom:
		return NewRandomBalancer(targets)
	case router.PolicyPowerOfTwo:
		return NewPowerOfTwoBalancer(targets)
	case router.PolicyConsistentHash, router.PolicyCacheAware, router.PolicyRendezvousHash:
		return NewConsistentHashBalancer(targets, 100)
	default:
		return NewRoundRobinBalancer(targets)
	}
}
