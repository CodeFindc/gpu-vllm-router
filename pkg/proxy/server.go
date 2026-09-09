package proxy

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	"gpu-vllm-router/pkg/gpustack"
	"gpu-vllm-router/pkg/router"
)

// ServerConfig configures the native Go reverse proxy server.
type ServerConfig struct {
	Host          string
	Port          int
	Policy        router.Policy
	ModelName     string // If empty, operates in full-cluster multi-model mode
	WatchInterval time.Duration
}

// ModelPool manages load balancing and active targets for a specific model.
type ModelPool struct {
	ModelName string
	Balancer  Balancer
	Targets   []*BackendTarget
}

// Server is the built-in HTTP reverse proxy server with multi-model dynamic load balancing.
type Server struct {
	cfg          ServerConfig
	client       *gpustack.Client
	mu           sync.RWMutex
	modelPools   map[string]*ModelPool  // Key: model name
	modelsList   []gpustack.ModelPublic // All models metadata
	allTargets   []*BackendTarget
	activeURLs   []string
	httpServer   *http.Server
	reverseProxy *httputil.ReverseProxy
	stopCh       chan struct{}
}

// NewServer creates a new reverse proxy Server.
func NewServer(cfg ServerConfig, client *gpustack.Client) *Server {
	if cfg.Host == "" {
		cfg.Host = "0.0.0.0"
	}
	if cfg.Port <= 0 {
		cfg.Port = 8000
	}
	if cfg.WatchInterval <= 0 {
		cfg.WatchInterval = 10 * time.Second
	}

	s := &Server{
		cfg:        cfg,
		client:     client,
		modelPools: make(map[string]*ModelPool),
		stopCh:     make(chan struct{}),
	}

	// Custom ReverseProxy
	proxy := &httputil.ReverseProxy{
		Director:       s.director,
		ModifyResponse: s.modifyResponse,
		ErrorHandler:   s.errorHandler,
		FlushInterval:  10 * time.Millisecond, // Instant flush for LLM streaming SSE
	}
	s.reverseProxy = proxy

	return s
}

// extractModelFromRequest inspects query param and JSON body to determine the requested model.
func extractModelFromRequest(req *http.Request) (string, []byte) {
	// 1. Check query parameter e.g. ?model=xxx
	if m := req.URL.Query().Get("model"); m != "" {
		return m, nil
	}

	// 2. Peek into JSON body for POST/PUT requests
	if req.Body != nil && (req.Method == http.MethodPost || req.Method == http.MethodPut) {
		bodyBytes, err := io.ReadAll(req.Body)
		if err == nil {
			// Restore request body for downstream handlers
			req.Body = io.NopCloser(bytes.NewReader(bodyBytes))

			var peek struct {
				Model string `json:"model"`
			}
			if err := json.Unmarshal(bodyBytes, &peek); err == nil && peek.Model != "" {
				return peek.Model, bodyBytes
			}
			return "", bodyBytes
		}
	}
	return "", nil
}

func (s *Server) findModelPool(modelName string) (*ModelPool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if len(s.modelPools) == 0 {
		return nil, errors.New("no running model instances available in GPUStack cluster")
	}

	// If no model was specified:
	if modelName == "" {
		// If single-model mode was configured, use it
		if s.cfg.ModelName != "" {
			if pool, ok := s.modelPools[s.cfg.ModelName]; ok {
				return pool, nil
			}
		}
		// If only 1 model pool exists in cluster, route to it automatically
		if len(s.modelPools) == 1 {
			for _, pool := range s.modelPools {
				return pool, nil
			}
		}
		var available []string
		for k := range s.modelPools {
			available = append(available, k)
		}
		return nil, fmt.Errorf("request did not specify 'model'. Available models in cluster: %v", available)
	}

	// 1. Exact match
	if pool, ok := s.modelPools[modelName]; ok {
		return pool, nil
	}

	// 2. Case-insensitive match
	for k, pool := range s.modelPools {
		if strings.EqualFold(k, modelName) {
			return pool, nil
		}
	}

	// 3. Substring / Prefix match
	for k, pool := range s.modelPools {
		if strings.Contains(strings.ToLower(k), strings.ToLower(modelName)) ||
			strings.Contains(strings.ToLower(modelName), strings.ToLower(k)) {
			return pool, nil
		}
	}

	var available []string
	for k := range s.modelPools {
		available = append(available, k)
	}
	return nil, fmt.Errorf("model %q does not exist or has no healthy instances in cluster. Available: %v", modelName, available)
}

func (s *Server) director(req *http.Request) {
	modelName, _ := extractModelFromRequest(req)
	pool, err := s.findModelPool(modelName)
	if err != nil {
		log.Printf("[Proxy] Model routing error: %v (Request Path: %s)", err, req.URL.Path)
		ctx := context.WithValue(req.Context(), "route_error", err)
		*req = *req.WithContext(ctx)
		return
	}

	target, err := pool.Balancer.SelectTarget(req)
	if err != nil {
		log.Printf("[Proxy] Balancer error for model %s: %v", pool.ModelName, err)
		ctx := context.WithValue(req.Context(), "route_error", err)
		*req = *req.WithContext(ctx)
		return
	}

	// Record start of request for active connection tracking
	pool.Balancer.RecordRequestStart(target)

	// Save selected target and balancer in context
	ctx := context.WithValue(req.Context(), "selected_target", target)
	ctx = context.WithValue(ctx, "selected_balancer", pool.Balancer)
	ctx = context.WithValue(ctx, "routed_model", pool.ModelName)
	*req = *req.WithContext(ctx)

	// Rewrite URL
	req.URL.Scheme = target.URL.Scheme
	req.URL.Host = target.URL.Host
	req.Host = target.URL.Host
	if _, ok := req.Header["User-Agent"]; !ok {
		req.Header.Set("User-Agent", "gpu-vllm-router/1.0")
	}
}

func (s *Server) modifyResponse(resp *http.Response) error {
	ctx := resp.Request.Context()
	target, _ := ctx.Value("selected_target").(*BackendTarget)
	balancer, _ := ctx.Value("selected_balancer").(Balancer)
	if target != nil && balancer != nil {
		balancer.RecordRequestEnd(target)
	}

	// Add router indicators
	resp.Header.Set("X-Router-Policy", string(s.cfg.Policy))
	if m, ok := ctx.Value("routed_model").(string); ok && m != "" {
		resp.Header.Set("X-Routed-Model", m)
	}
	return nil
}

func (s *Server) errorHandler(w http.ResponseWriter, req *http.Request, err error) {
	ctx := req.Context()
	target, _ := ctx.Value("selected_target").(*BackendTarget)
	balancer, _ := ctx.Value("selected_balancer").(Balancer)
	if target != nil && balancer != nil {
		balancer.RecordRequestEnd(target)
	}

	// If route_error occurred (model not found)
	if routeErr, ok := ctx.Value("route_error").(error); ok && routeErr != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"error": map[string]interface{}{
				"message": routeErr.Error(),
				"type":    "invalid_request_error",
				"param":   "model",
				"code":    "model_not_found",
			},
		})
		return
	}

	log.Printf("[Proxy] Forwarding error to %s: %v", req.URL.String(), err)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadGateway)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"error": map[string]interface{}{
			"message": fmt.Sprintf("GPU router backend error: %v", err),
			"type":    "router_bad_gateway",
			"code":    502,
		},
	})
}

// Start boots the proxy server and watches GPUStack instances.
func (s *Server) Start(ctx context.Context) error {
	// Initial endpoint discovery
	if s.cfg.ModelName != "" {
		// Single Model Mode
		endpoints, model, err := s.client.GetRunningWorkerEndpoints(ctx, s.cfg.ModelName)
		if err != nil {
			return fmt.Errorf("initial discovery failed for model %q: %w", s.cfg.ModelName, err)
		}
		if len(endpoints) == 0 {
			return fmt.Errorf("no running instances found for model %q in GPUStack", s.cfg.ModelName)
		}
		log.Printf("[Proxy] Discovered %d running instance(s) for model %s (ID: %d):", len(endpoints), model.Name, model.ID)
		s.updateSingleModelEndpoints(s.cfg.ModelName, endpoints)
	} else {
		// Full Cluster Multi-Model Mode
		cluster, err := s.client.GetAllRunningWorkerEndpoints(ctx)
		if err != nil {
			return fmt.Errorf("cluster-wide model discovery failed: %w", err)
		}
		if cluster.InstanceCount == 0 {
			return errors.New("no running model instances found across entire GPUStack cluster")
		}
		log.Printf("[Proxy] [Multi-Model] Discovered %d active model(s) and %d running instance(s) in cluster:",
			cluster.ModelCount, cluster.InstanceCount)
		s.updateClusterEndpoints(cluster)
	}

	// Setup HTTP handler multiplexer
	mux := http.NewServeMux()
	mux.HandleFunc("/admin/stats", s.handleStats)
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/v1/models", s.handleModels)
	mux.Handle("/", s.reverseProxy)

	addr := fmt.Sprintf("%s:%d", s.cfg.Host, s.cfg.Port)
	s.httpServer = &http.Server{
		Addr:    addr,
		Handler: mux,
	}

	// Start background watch loop
	go s.watchLoop(ctx)

	log.Printf("[Proxy] Native Multi-Model Load Balancer running on http://%s (Policy: %s)", addr, s.cfg.Policy)

	if err := s.httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("proxy server failed: %w", err)
	}

	return nil
}

// Stop gracefully shuts down the proxy server.
func (s *Server) Stop(ctx context.Context) error {
	close(s.stopCh)
	if s.httpServer != nil {
		return s.httpServer.Shutdown(ctx)
	}
	return nil
}

func (s *Server) updateSingleModelEndpoints(modelName string, endpoints []gpustack.WorkerEndpoint) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var targets []*BackendTarget
	var urls []string

	for _, ep := range endpoints {
		u, err := url.Parse(ep.URL)
		if err != nil {
			continue
		}
		targets = append(targets, &BackendTarget{
			URL:       u,
			URLString: ep.URL,
			Healthy:   true,
		})
		urls = append(urls, ep.URL)
		log.Printf("  -> Model: %-25s Backend: %s (Worker: %s)", ep.ModelName, ep.URL, ep.WorkerName)
	}

	sort.Strings(urls)
	s.allTargets = targets
	s.activeURLs = urls

	pool := &ModelPool{
		ModelName: modelName,
		Balancer:  NewBalancer(s.cfg.Policy, targets),
		Targets:   targets,
	}
	s.modelPools[modelName] = pool
}

func (s *Server) updateClusterEndpoints(cluster *gpustack.ClusterEndpoints) {
	s.mu.Lock()
	defer s.mu.Unlock()

	newPools := make(map[string]*ModelPool)
	var allTargets []*BackendTarget
	var allURLs []string
	var modelsList []gpustack.ModelPublic

	for mName, endpoints := range cluster.ModelsEndpoints {
		var targets []*BackendTarget
		for _, ep := range endpoints {
			u, err := url.Parse(ep.URL)
			if err != nil {
				continue
			}
			t := &BackendTarget{
				URL:       u,
				URLString: ep.URL,
				Healthy:   true,
			}
			targets = append(targets, t)
			allTargets = append(allTargets, t)
			allURLs = append(allURLs, ep.URL)
			log.Printf("  -> [%s] Worker: %-12s Endpoint: %s", ep.ModelName, ep.WorkerName, ep.URL)
		}

		newPools[mName] = &ModelPool{
			ModelName: mName,
			Balancer:  NewBalancer(s.cfg.Policy, targets),
			Targets:   targets,
		}

		if mInfo, ok := cluster.Models[mName]; ok {
			modelsList = append(modelsList, mInfo)
		} else {
			modelsList = append(modelsList, gpustack.ModelPublic{Name: mName})
		}
	}

	sort.Strings(allURLs)
	s.modelPools = newPools
	s.allTargets = allTargets
	s.activeURLs = allURLs
	s.modelsList = modelsList
}

func (s *Server) watchLoop(ctx context.Context) {
	ticker := time.NewTicker(s.cfg.WatchInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-s.stopCh:
			return
		case <-ticker.C:
			if s.cfg.ModelName != "" {
				// Single model refresh
				endpoints, _, err := s.client.GetRunningWorkerEndpoints(ctx, s.cfg.ModelName)
				if err != nil {
					log.Printf("[Proxy] Warning: failed to refresh instances: %v", err)
					continue
				}
				var newURLs []string
				for _, ep := range endpoints {
					newURLs = append(newURLs, ep.URL)
				}
				sort.Strings(newURLs)

				s.mu.RLock()
				currentURLs := s.activeURLs
				s.mu.RUnlock()

				if strings.Join(currentURLs, ",") != strings.Join(newURLs, ",") {
					log.Printf("[Proxy] Model %s instances changed! Updating...", s.cfg.ModelName)
					s.updateSingleModelEndpoints(s.cfg.ModelName, endpoints)
				}
			} else {
				// Cluster-wide all models refresh
				cluster, err := s.client.GetAllRunningWorkerEndpoints(ctx)
				if err != nil {
					log.Printf("[Proxy] Warning: failed to refresh cluster models: %v", err)
					continue
				}

				var newURLs []string
				for _, ep := range cluster.AllEndpoints {
					newURLs = append(newURLs, ep.URL)
				}
				sort.Strings(newURLs)

				s.mu.RLock()
				currentURLs := s.activeURLs
				s.mu.RUnlock()

				if strings.Join(currentURLs, ",") != strings.Join(newURLs, ",") {
					log.Printf("[Proxy] Cluster-wide instances or models changed! Updating routing table...")
					log.Printf("  Previous URLs: %v", currentURLs)
					log.Printf("  New URLs:      %v", newURLs)
					s.updateClusterEndpoints(cluster)
				}
			}
		}
	}
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}

// handleModels returns OpenAI-compatible /v1/models response containing all available models.
func (s *Server) handleModels(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	modelsList := s.modelsList
	pools := s.modelPools
	s.mu.RUnlock()

	type openAIModel struct {
		ID         string                   `json:"id"`
		Object     string                   `json:"object"`
		Created    int64                    `json:"created"`
		OwnedBy    string                   `json:"owned_by"`
		Permission []map[string]interface{} `json:"permission"`
	}

	var data []openAIModel
	for _, m := range modelsList {
		if _, ok := pools[m.Name]; ok {
			createdTime := m.CreatedAt.Unix()
			if createdTime <= 0 {
				createdTime = time.Now().Unix()
			}
			data = append(data, openAIModel{
				ID:         m.Name,
				Object:     "model",
				Created:    createdTime,
				OwnedBy:    "gpustack",
				Permission: []map[string]interface{}{{"id": "modelperm-default", "allow_sampling": true}},
			})
		}
	}

	// If modelsList was empty, populate from pool names
	if len(data) == 0 {
		for mName := range pools {
			data = append(data, openAIModel{
				ID:         mName,
				Object:     "model",
				Created:    time.Now().Unix(),
				OwnedBy:    "gpustack",
				Permission: []map[string]interface{}{{"id": "modelperm-default", "allow_sampling": true}},
			})
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"object": "list",
		"data":   data,
	})
}

func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	pools := s.modelPools
	totalTargets := len(s.allTargets)
	s.mu.RUnlock()

	type targetStat struct {
		URL         string `json:"url"`
		ActiveConns int64  `json:"active_conns"`
		Healthy     bool   `json:"healthy"`
	}

	type modelStat struct {
		ModelName    string       `json:"model_name"`
		BackendCount int          `json:"backend_count"`
		Backends     []targetStat `json:"backends"`
	}

	modelsStats := make(map[string]modelStat)
	for mName, pool := range pools {
		var bStats []targetStat
		for _, t := range pool.Targets {
			bStats = append(bStats, targetStat{
				URL:         t.URLString,
				ActiveConns: t.ActiveConns,
				Healthy:     t.Healthy,
			})
		}
		modelsStats[mName] = modelStat{
			ModelName:    mName,
			BackendCount: len(pool.Targets),
			Backends:     bStats,
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"mode":            "multi_model_auto_sync",
		"policy":          s.cfg.Policy,
		"model_count":     len(pools),
		"total_backends":  totalTargets,
		"models":          modelsStats,
		"server_time_utc": time.Now().UTC().Format(time.RFC3339),
	})
}
