package router

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"reflect"
	"sort"
	"strings"
	"sync"
	"time"

	"gpu-vllm-router/pkg/gpustack"
)

// SupervisorConfig defines configuration for the router supervisor.
type SupervisorConfig struct {
	ZeroDowntime       bool
	PublicHost         string
	PublicPort         int
	DrainTimeout       time.Duration
	HealthCheckTimeout time.Duration
	WatchInterval      time.Duration

	RouterCfg Config
}

type runningProcess struct {
	cmd       *exec.Cmd
	port      int
	targetURL *url.URL
}

// ModelRunner manages a dedicated vllm-router instance for a specific model.
type ModelRunner struct {
	ModelName    string
	mu           sync.RWMutex
	CurrentProc  *runningProcess
	ActiveTarget *url.URL
	ActiveURLs   []string
}

// Supervisor oversees vllm-router instances with zero-downtime rolling reload.
// In single-model mode (-model <name>), it manages 1 official vllm-router process.
// In multi-model mode (model == ""), it manages a pool of official vllm-router processes (1 per model).
type Supervisor struct {
	client    *gpustack.Client
	modelName string
	cfg       SupervisorConfig

	mu           sync.RWMutex
	runners      map[string]*ModelRunner
	currentProc  *runningProcess // for backward compatibility & single-model direct access
	activeTarget *url.URL         // for backward compatibility & single-model direct access
	activeURLs   []string         // for backward compatibility & single-model direct access

	frontServer *http.Server
	stopCh      chan struct{}
}

// NewSupervisor creates a new Supervisor instance.
func NewSupervisor(client *gpustack.Client, modelName string, cfg SupervisorConfig) *Supervisor {
	if cfg.PublicHost == "" {
		cfg.PublicHost = "0.0.0.0"
	}
	if cfg.PublicPort <= 0 {
		cfg.PublicPort = 8000
	}
	if cfg.WatchInterval <= 0 {
		cfg.WatchInterval = 10 * time.Second
	}
	if cfg.DrainTimeout <= 0 {
		cfg.DrainTimeout = 60 * time.Second
	}
	if cfg.HealthCheckTimeout <= 0 {
		cfg.HealthCheckTimeout = 30 * time.Second
	}

	return &Supervisor{
		client:    client,
		modelName: modelName,
		cfg:       cfg,
		runners:   make(map[string]*ModelRunner),
		stopCh:    make(chan struct{}),
	}
}

func getFreePort() (int, error) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port, nil
}

// inspectModelFromRequest peeks at the incoming request to determine the target model name.
func inspectModelFromRequest(req *http.Request) (string, []byte) {
	if m := req.URL.Query().Get("model"); m != "" {
		return m, nil
	}

	if req.Body != nil && (req.Method == http.MethodPost || req.Method == http.MethodPut) {
		bodyBytes, err := io.ReadAll(req.Body)
		if err == nil {
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

// findRunner matches the requested model name against active model runners.
func (s *Supervisor) findRunner(modelName string) (*ModelRunner, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if len(s.runners) == 0 {
		return nil, fmt.Errorf("no active vllm-router instances in cluster")
	}

	if modelName == "" {
		if s.modelName != "" {
			if r, ok := s.runners[s.modelName]; ok {
				return r, nil
			}
		}
		if len(s.runners) == 1 {
			for _, r := range s.runners {
				return r, nil
			}
		}
		var available []string
		for k := range s.runners {
			available = append(available, k)
		}
		return nil, fmt.Errorf("request did not specify 'model'. Available models in cluster: %v", available)
	}

	// 1. Exact match
	if r, ok := s.runners[modelName]; ok {
		return r, nil
	}

	// 2. Case-insensitive match
	for k, r := range s.runners {
		if strings.EqualFold(k, modelName) {
			return r, nil
		}
	}

	// 3. Substring / Prefix match
	for k, r := range s.runners {
		if strings.Contains(strings.ToLower(k), strings.ToLower(modelName)) ||
			strings.Contains(strings.ToLower(modelName), strings.ToLower(k)) {
			return r, nil
		}
	}

	var available []string
	for k := range s.runners {
		available = append(available, k)
	}
	return nil, fmt.Errorf("model %q not found. Available models: %v", modelName, available)
}

// Start launches the initial vllm-router instances and the front gateway.
func (s *Supervisor) Start(ctx context.Context) error {
	s.mu.Lock()
	s.runners = make(map[string]*ModelRunner)
	s.mu.Unlock()

	if s.modelName != "" {
		// Single Model Mode
		endpoints, model, err := s.client.GetRunningWorkerEndpoints(ctx, s.modelName)
		if err != nil {
			return fmt.Errorf("initial discovery failed for model %q: %w", s.modelName, err)
		}
		if len(endpoints) == 0 {
			return fmt.Errorf("no running instances found for model %q in GPUStack", s.modelName)
		}
		var urls []string
		log.Printf("[Supervisor] Discovered %d running instance(s) for model %s (ID: %d):", len(endpoints), model.Name, model.ID)
		for _, ep := range endpoints {
			log.Printf("  -> Instance: %-25s Worker: %-15s Endpoint: %s", ep.InstanceName, ep.WorkerName, ep.URL)
			urls = append(urls, ep.URL)
		}
		sort.Strings(urls)

		runner, err := s.startModelRunner(ctx, model.Name, urls)
		if err != nil {
			return fmt.Errorf("failed to start router for model %s: %w", model.Name, err)
		}
		s.mu.Lock()
		s.runners[model.Name] = runner
		s.currentProc = runner.CurrentProc
		s.activeTarget = runner.ActiveTarget
		s.activeURLs = urls
		s.mu.Unlock()
	} else {
		// Cluster-wide Multi-Model Pool Mode
		cluster, err := s.client.GetAllRunningWorkerEndpoints(ctx)
		if err != nil {
			return fmt.Errorf("cluster-wide model discovery failed: %w", err)
		}
		if cluster.InstanceCount == 0 {
			return fmt.Errorf("no running model instances found across entire GPUStack cluster")
		}
		log.Printf("[Supervisor] [Multi-Model Router Pool] Discovered %d model(s) and %d running instance(s) in cluster:",
			cluster.ModelCount, cluster.InstanceCount)

		for mName, eps := range cluster.ModelsEndpoints {
			var urls []string
			for _, ep := range eps {
				urls = append(urls, ep.URL)
			}
			sort.Strings(urls)
			log.Printf("[Supervisor] Initializing vllm-router process for model %q with %d worker(s)...", mName, len(urls))

			runner, err := s.startModelRunner(ctx, mName, urls)
			if err != nil {
				log.Printf("[Supervisor] Warning: failed to start router for model %q: %v", mName, err)
				continue
			}
			s.mu.Lock()
			s.runners[mName] = runner
			if s.activeTarget == nil {
				s.activeTarget = runner.ActiveTarget
				s.currentProc = runner.CurrentProc
				s.activeURLs = urls
			}
			s.mu.Unlock()
		}

		s.mu.RLock()
		activeCount := len(s.runners)
		s.mu.RUnlock()
		if activeCount == 0 {
			return fmt.Errorf("failed to initialize any vllm-router instances for cluster models")
		}
	}

	// Start Front Gateway Server on PublicHost:PublicPort
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/v1/models", s.handleModels)
	mux.HandleFunc("/admin/supervisor", s.handleSupervisorStatus)
	mux.HandleFunc("/", s.handleProxy)

	addr := fmt.Sprintf("%s:%d", s.cfg.PublicHost, s.cfg.PublicPort)
	s.frontServer = &http.Server{
		Addr:    addr,
		Handler: mux,
	}

	go func() {
		log.Printf("[Supervisor] Front Gateway listening on http://%s (Managing %d model router processes, Zero-Downtime=%t)",
			addr, len(s.runners), s.cfg.ZeroDowntime)
		if err := s.frontServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("[Supervisor] Front proxy server error: %v", err)
		}
	}()

	// Start dynamic watch loop
	go s.watchLoop(ctx)
	return nil
}

func (s *Supervisor) startModelRunner(ctx context.Context, modelName string, workerURLs []string) (*ModelRunner, error) {
	internalPort, err := getFreePort()
	if err != nil {
		return nil, fmt.Errorf("failed to allocate internal port for %s: %w", modelName, err)
	}

	log.Printf("[Supervisor] Launching vllm-router process for [%s] on internal port %d (Workers: %d)...",
		modelName, internalPort, len(workerURLs))
	proc, err := s.spawnProcess(ctx, "127.0.0.1", internalPort, workerURLs)
	if err != nil {
		return nil, fmt.Errorf("failed to spawn router process for %s: %w", modelName, err)
	}

	// Wait for process readiness
	if err := s.waitForHealth(ctx, internalPort, s.cfg.HealthCheckTimeout); err != nil {
		if proc.cmd.Process != nil {
			_ = proc.cmd.Process.Kill()
		}
		return nil, fmt.Errorf("health check failed on internal port %d for model %s: %w", internalPort, modelName, err)
	}

	return &ModelRunner{
		ModelName:    modelName,
		CurrentProc:  proc,
		ActiveTarget: proc.targetURL,
		ActiveURLs:   workerURLs,
	}, nil
}

func (s *Supervisor) handleHealth(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	count := len(s.runners)
	s.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	if count == 0 {
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte(`{"status":"unavailable","message":"no active model routers in supervisor"}`))
		return
	}
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`))
}

func (s *Supervisor) handleModels(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	var modelCards []map[string]interface{}
	now := time.Now().Unix()
	for name := range s.runners {
		modelCards = append(modelCards, map[string]interface{}{
			"id":       name,
			"object":   "model",
			"created":  now,
			"owned_by": "gpustack-supervisor",
		})
	}
	s.mu.RUnlock()

	resp := map[string]interface{}{
		"object": "list",
		"data":   modelCards,
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func (s *Supervisor) handleSupervisorStatus(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	modelsMap := make(map[string]interface{})
	for name, runner := range s.runners {
		runner.mu.RLock()
		port := 0
		if runner.CurrentProc != nil {
			port = runner.CurrentProc.port
		}
		targetStr := ""
		if runner.ActiveTarget != nil {
			targetStr = runner.ActiveTarget.String()
		}
		modelsMap[name] = map[string]interface{}{
			"internal_port": port,
			"target":        targetStr,
			"worker_count":  len(runner.ActiveURLs),
			"worker_urls":   runner.ActiveURLs,
		}
		runner.mu.RUnlock()
	}

	resp := map[string]interface{}{
		"multi_model":   s.modelName == "",
		"public_port":   s.cfg.PublicPort,
		"model_count":   len(s.runners),
		"drain_timeout": s.cfg.DrainTimeout.String(),
		"zero_downtime": s.cfg.ZeroDowntime,
		"models":        modelsMap,
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func (s *Supervisor) handleProxy(w http.ResponseWriter, req *http.Request) {
	modelName, _ := inspectModelFromRequest(req)
	runner, err := s.findRunner(modelName)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		resp := map[string]interface{}{
			"error": map[string]interface{}{
				"message": fmt.Sprintf("The model %q does not exist or has no healthy backends in GPUStack cluster. Details: %v", modelName, err),
				"type":    "invalid_request_error",
				"param":   "model",
				"code":    "model_not_found",
			},
		}
		_ = json.NewEncoder(w).Encode(resp)
		return
	}

	runner.mu.RLock()
	target := runner.ActiveTarget
	runner.mu.RUnlock()

	if target == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte(`{"error":{"message":"Router process for model is initializing, please retry shortly","type":"service_unavailable"}}`))
		return
	}

	proxy := &httputil.ReverseProxy{
		Director: func(r *http.Request) {
			r.URL.Scheme = target.Scheme
			r.URL.Host = target.Host
			r.Host = target.Host
			if _, ok := r.Header["User-Agent"]; !ok {
				r.Header.Set("User-Agent", "gpu-vllm-router-supervisor/1.0")
			}
		},
		FlushInterval: 10 * time.Millisecond,
		ErrorHandler: func(rw http.ResponseWriter, r *http.Request, err error) {
			log.Printf("[Supervisor:Proxy] Forwarding error for model %s: %v", runner.ModelName, err)
			rw.WriteHeader(http.StatusBadGateway)
			_, _ = rw.Write([]byte(fmt.Sprintf(`{"error":{"message":"Router gateway error for model %s: %v","type":"bad_gateway"}}`, runner.ModelName, err)))
		},
	}

	proxy.ServeHTTP(w, req)
}

func (s *Supervisor) spawnProcess(ctx context.Context, host string, port int, workerURLs []string) (*runningProcess, error) {
	cfg := s.cfg.RouterCfg
	cfg.Host = host
	cfg.Port = port
	cfg.WorkerURLs = workerURLs

	args := BuildArgs(cfg)
	bin := cfg.RouterBin
	if bin == "" {
		bin = "vllm-router"
	}

	log.Printf("[Supervisor] Spawning %s on %s:%d (Workers: %d, Policy: %s)", bin, host, port, len(workerURLs), cfg.Policy)

	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Env = os.Environ()

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to get stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to get stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start %s: %w", bin, err)
	}

	prefix := fmt.Sprintf("[vllm-router:%d]", port)
	go streamPipe(stdout, prefix)
	go streamPipe(stderr, prefix)

	targetURL, _ := url.Parse(fmt.Sprintf("http://127.0.0.1:%d", port))

	proc := &runningProcess{
		cmd:       cmd,
		port:      port,
		targetURL: targetURL,
	}

	go func() {
		waitErr := cmd.Wait()
		log.Printf("%s Process exited: %v", prefix, waitErr)
	}()

	return proc, nil
}

func streamPipe(r io.Reader, prefix string) {
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		log.Printf("%s %s", prefix, scanner.Text())
	}
}

func (s *Supervisor) waitForHealth(ctx context.Context, port int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	healthURL := fmt.Sprintf("http://127.0.0.1:%d/health", port)
	modelsURL := fmt.Sprintf("http://127.0.0.1:%d/v1/models", port)

	client := &http.Client{Timeout: 1 * time.Second}

	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(300 * time.Millisecond):
			// Check /health first
			resp, err := client.Get(healthURL)
			if err == nil {
				resp.Body.Close()
				if resp.StatusCode == http.StatusOK {
					log.Printf("[Supervisor] Health check passed on port %d via /health", port)
					return nil
				}
			}

			// Fallback check /v1/models
			resp2, err2 := client.Get(modelsURL)
			if err2 == nil {
				resp2.Body.Close()
				if resp2.StatusCode == http.StatusOK {
					log.Printf("[Supervisor] Health check passed on port %d via /v1/models", port)
					return nil
				}
			}
		}
	}

	return fmt.Errorf("health check timed out after %v on port %d", timeout, port)
}

// watchLoop periodically checks GPUStack for changes in model instances.
func (s *Supervisor) watchLoop(ctx context.Context) {
	ticker := time.NewTicker(s.cfg.WatchInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-s.stopCh:
			return
		case <-ticker.C:
			if s.modelName != "" {
				// Single model watch
				endpoints, _, err := s.client.GetRunningWorkerEndpoints(ctx, s.modelName)
				if err != nil {
					log.Printf("[Supervisor] Warning: failed to query GPUStack instances for %s: %v", s.modelName, err)
					continue
				}
				var newURLs []string
				for _, ep := range endpoints {
					newURLs = append(newURLs, ep.URL)
				}
				sort.Strings(newURLs)

				s.mu.RLock()
				runner := s.runners[s.modelName]
				s.mu.RUnlock()

				if runner != nil {
					runner.mu.RLock()
					currURLs := runner.ActiveURLs
					runner.mu.RUnlock()

					if !reflect.DeepEqual(currURLs, newURLs) {
						log.Printf("[Supervisor] [Watch] Detected topology change for model %s!", s.modelName)
						log.Printf("  Previous URLs: %v", currURLs)
						log.Printf("  New URLs:      %v", newURLs)
						if len(newURLs) > 0 {
							s.performZeroDowntimeReloadForRunner(ctx, runner, newURLs)
						}
					}
				}
			} else {
				// Cluster-wide multi-model watch
				cluster, err := s.client.GetAllRunningWorkerEndpoints(ctx)
				if err != nil {
					log.Printf("[Supervisor] Warning: failed to query GPUStack cluster: %v", err)
					continue
				}

				// 1. Check existing and new models
				for mName, eps := range cluster.ModelsEndpoints {
					var newURLs []string
					for _, ep := range eps {
						newURLs = append(newURLs, ep.URL)
					}
					sort.Strings(newURLs)

					s.mu.RLock()
					runner, exists := s.runners[mName]
					s.mu.RUnlock()

					if !exists {
						log.Printf("[Supervisor] [Watch] Detected new model %q with %d instance(s) in GPUStack! Spawning router...", mName, len(newURLs))
						newRunner, err := s.startModelRunner(ctx, mName, newURLs)
						if err != nil {
							log.Printf("[Supervisor] Failed to spawn router for new model %q: %v", mName, err)
							continue
						}
						s.mu.Lock()
						s.runners[mName] = newRunner
						s.mu.Unlock()
					} else {
						runner.mu.RLock()
						currURLs := runner.ActiveURLs
						runner.mu.RUnlock()

						if !reflect.DeepEqual(currURLs, newURLs) {
							log.Printf("[Supervisor] [Watch] Detected topology change for model %q!", mName)
							log.Printf("  Previous URLs: %v", currURLs)
							log.Printf("  New URLs:      %v", newURLs)
							if len(newURLs) > 0 {
								s.performZeroDowntimeReloadForRunner(ctx, runner, newURLs)
							}
						}
					}
				}

				// 2. Check removed/stopped models
				s.mu.RLock()
				var modelsToRemove []string
				for mName := range s.runners {
					if _, stillActive := cluster.ModelsEndpoints[mName]; !stillActive {
						modelsToRemove = append(modelsToRemove, mName)
					}
				}
				s.mu.RUnlock()

				for _, mName := range modelsToRemove {
					log.Printf("[Supervisor] [Watch] Model %q has no running instances in GPUStack! Draining and stopping router...", mName)
					s.mu.Lock()
					runner := s.runners[mName]
					delete(s.runners, mName)
					s.mu.Unlock()

					if runner != nil && runner.CurrentProc != nil && runner.CurrentProc.cmd.Process != nil {
						_ = runner.CurrentProc.cmd.Process.Kill()
					}
				}
			}
		}
	}
}

// performZeroDowntimeReloadForRunner executes blue-green rolling reload for a specific model runner.
func (s *Supervisor) performZeroDowntimeReloadForRunner(ctx context.Context, runner *ModelRunner, newURLs []string) {
	nextPort, err := getFreePort()
	if err != nil {
		log.Printf("[Supervisor] Error allocating port for [%s] reload: %v", runner.ModelName, err)
		return
	}

	log.Printf("[Supervisor] [Zero-Downtime Reload] [%s] Step 1/4: Launching candidate on internal port %d (New Workers: %d)...",
		runner.ModelName, nextPort, len(newURLs))
	newProc, err := s.spawnProcess(ctx, "127.0.0.1", nextPort, newURLs)
	if err != nil {
		log.Printf("[Supervisor] Failed to spawn candidate for [%s]: %v", runner.ModelName, err)
		return
	}

	log.Printf("[Supervisor] [Zero-Downtime Reload] [%s] Step 2/4: Probing candidate health on port %d...", runner.ModelName, nextPort)
	if err := s.waitForHealth(ctx, nextPort, s.cfg.HealthCheckTimeout); err != nil {
		log.Printf("[Supervisor] Candidate health check failed for [%s] on port %d: %v. Aborting reload!", runner.ModelName, nextPort, err)
		if newProc.cmd.Process != nil {
			_ = newProc.cmd.Process.Kill()
		}
		return
	}

	log.Printf("[Supervisor] [Zero-Downtime Reload] [%s] Step 3/4: Candidate healthy! Atomically switching traffic to port %d...", runner.ModelName, nextPort)
	runner.mu.Lock()
	oldProc := runner.CurrentProc
	runner.CurrentProc = newProc
	runner.ActiveTarget = newProc.targetURL
	runner.ActiveURLs = newURLs
	runner.mu.Unlock()

	s.mu.Lock()
	if s.modelName == runner.ModelName || s.modelName != "" {
		s.activeTarget = newProc.targetURL
		s.activeURLs = newURLs
		s.currentProc = newProc
	}
	s.mu.Unlock()

	log.Printf("[Supervisor] [Zero-Downtime Reload] [%s] Step 4/4: Traffic switched! Draining old router (PID %d on port %d) for %v...",
		runner.ModelName, oldProc.cmd.Process.Pid, oldProc.port, s.cfg.DrainTimeout)

	go func(proc *runningProcess, drainDuration time.Duration, mName string) {
		time.Sleep(drainDuration)
		log.Printf("[Supervisor] Drain period completed for [%s] on port %d (PID %d). Terminating old process.", mName, proc.port, proc.cmd.Process.Pid)
		if proc.cmd.Process != nil {
			_ = proc.cmd.Process.Kill()
		}
	}(oldProc, s.cfg.DrainTimeout, runner.ModelName)
}

// Stop cleanly terminates all processes and servers.
func (s *Supervisor) Stop() {
	close(s.stopCh)
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.frontServer != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = s.frontServer.Shutdown(ctx)
	}

	for mName, runner := range s.runners {
		runner.mu.Lock()
		if runner.CurrentProc != nil && runner.CurrentProc.cmd.Process != nil {
			log.Printf("[Supervisor] Terminating router process for [%s] on port %d (PID %d)...",
				mName, runner.CurrentProc.port, runner.CurrentProc.cmd.Process.Pid)
			_ = runner.CurrentProc.cmd.Process.Kill()
		}
		runner.mu.Unlock()
	}
}
