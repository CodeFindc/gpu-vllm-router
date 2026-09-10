package dashboard

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type mockProvider struct {
	data     *TopologyData
	probeOK  bool
	probeErr error
	resetErr error
}

func (m *mockProvider) GetTopology(ctx context.Context) (*TopologyData, error) {
	return m.data, nil
}

func (m *mockProvider) ProbeWorker(ctx context.Context, workerURL string) (bool, error) {
	return m.probeOK, m.probeErr
}

func (m *mockProvider) ResetBreaker(ctx context.Context, workerURL string) error {
	return m.resetErr
}

func TestDashboardUIHandler(t *testing.T) {
	mock := &mockProvider{
		data: &TopologyData{
			Mode:          "proxy",
			Policy:        "consistent_hash",
			PublicAddr:    "0.0.0.0:8000",
			ClusterHealth: "healthy",
			TotalModels:   1,
			TotalWorkers:  2,
		},
	}
	h := NewHandler(mock)

	// 1. Test /dashboard
	rw := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/dashboard", nil)
	h.ServeHTTP(rw, req)

	if rw.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for /dashboard, got %d", rw.Code)
	}
	if !strings.Contains(rw.Header().Get("Content-Type"), "text/html") {
		t.Errorf("expected text/html content type, got %s", rw.Header().Get("Content-Type"))
	}
	body := rw.Body.String()
	if !strings.Contains(body, "GPUStack vLLM Router") {
		t.Errorf("expected HTML to contain title brand")
	}
	if !strings.Contains(body, "id=\"root\"") {
		t.Errorf("expected HTML to contain React root container id=\"root\"")
	}
	if !strings.Contains(body, "topology") {
		t.Errorf("expected React bundle to contain topology component logic")
	}

	// 2. Test /ui redirect
	rwRedirect := httptest.NewRecorder()
	reqRedirect, _ := http.NewRequest(http.MethodGet, "/ui", nil)
	h.ServeHTTP(rwRedirect, reqRedirect)

	if rwRedirect.Code != http.StatusFound {
		t.Errorf("expected 302 redirect for /ui, got %d", rwRedirect.Code)
	}
	if rwRedirect.Header().Get("Location") != "/dashboard" {
		t.Errorf("expected location /dashboard, got %s", rwRedirect.Header().Get("Location"))
	}
}

func TestDashboardTopologyAPI(t *testing.T) {
	mock := &mockProvider{
		data: &TopologyData{
			Mode:             "proxy",
			Policy:           "consistent_hash",
			PublicAddr:       "127.0.0.1:8000",
			ClusterHealth:    "healthy",
			TotalModels:      1,
			TotalWorkers:     2,
			HealthyWorkers:   2,
			TotalActiveConns: 5,
			Models: []ModelTopology{
				{
					ModelName:    "DeepSeek-V4",
					Policy:       "consistent_hash",
					WorkerCount:  2,
					HealthyCount: 2,
					ActiveConns:  5,
					Workers: []WorkerTopology{
						{
							URL:                 "http://worker-1:8000",
							ActiveConns:         3,
							Healthy:             true,
							CircuitState:        "CLOSED",
							ConsecutiveFailures: 0,
						},
						{
							URL:                 "http://worker-2:8000",
							ActiveConns:         2,
							Healthy:             true,
							CircuitState:        "CLOSED",
							ConsecutiveFailures: 0,
						},
					},
				},
			},
		},
		probeOK: true,
	}

	h := NewHandler(mock)

	// 1. Test GET /api/topology
	rw := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/api/topology", nil)
	h.ServeHTTP(rw, req)

	if rw.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for /api/topology, got %d", rw.Code)
	}

	var topo TopologyData
	if err := json.Unmarshal(rw.Body.Bytes(), &topo); err != nil {
		t.Fatalf("failed to parse topology JSON: %v", err)
	}
	if topo.TotalModels != 1 || len(topo.Models) != 1 {
		t.Errorf("expected 1 model, got %d", topo.TotalModels)
	}
	if topo.Models[0].ModelName != "DeepSeek-V4" {
		t.Errorf("expected model name DeepSeek-V4, got %s", topo.Models[0].ModelName)
	}

	// 2. Test POST /api/probe
	probeBody, _ := json.Marshal(ProbeRequest{URL: "http://worker-1:8000"})
	rwProbe := httptest.NewRecorder()
	reqProbe, _ := http.NewRequest(http.MethodPost, "/api/probe", bytes.NewReader(probeBody))
	h.ServeHTTP(rwProbe, reqProbe)

	if rwProbe.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for /api/probe, got %d", rwProbe.Code)
	}
	var probeResp ProbeResponse
	if err := json.Unmarshal(rwProbe.Body.Bytes(), &probeResp); err != nil {
		t.Fatalf("failed to decode probe response: %v", err)
	}
	if !probeResp.Success {
		t.Errorf("expected probe success")
	}

	// 3. Test POST /api/reset-breaker
	resetBody, _ := json.Marshal(ResetBreakerRequest{URL: "http://worker-1:8000"})
	rwReset := httptest.NewRecorder()
	reqReset, _ := http.NewRequest(http.MethodPost, "/api/reset-breaker", bytes.NewReader(resetBody))
	h.ServeHTTP(rwReset, reqReset)

	if rwReset.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for /api/reset-breaker, got %d", rwReset.Code)
	}
	var resetResp ResetBreakerResponse
	if err := json.Unmarshal(rwReset.Body.Bytes(), &resetResp); err != nil {
		t.Fatalf("failed to decode reset response: %v", err)
	}
	if !resetResp.Success {
		t.Errorf("expected reset success")
	}
}
