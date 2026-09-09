package proxy

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"gpu-vllm-router/pkg/gpustack"
	"gpu-vllm-router/pkg/router"
)

func TestMultiModelRouting(t *testing.T) {
	s := NewServer(ServerConfig{Policy: router.PolicyRoundRobin}, nil)

	targetA1, _ := url.Parse("http://model-a-1:8000")
	targetA2, _ := url.Parse("http://model-a-2:8000")
	targetB1, _ := url.Parse("http://model-b-1:8000")

	cluster := &gpustack.ClusterEndpoints{
		ModelsEndpoints: map[string][]gpustack.WorkerEndpoint{
			"DeepSeek-V4-Flash-0731-w8a8": {
				{ModelName: "DeepSeek-V4-Flash-0731-w8a8", URL: "http://model-a-1:8000"},
				{ModelName: "DeepSeek-V4-Flash-0731-w8a8", URL: "http://model-a-2:8000"},
			},
			"Qwen3.6-27B": {
				{ModelName: "Qwen3.6-27B", URL: "http://model-b-1:8000"},
			},
		},
		Models: map[string]gpustack.ModelPublic{
			"DeepSeek-V4-Flash-0731-w8a8": {Name: "DeepSeek-V4-Flash-0731-w8a8"},
			"Qwen3.6-27B":                 {Name: "Qwen3.6-27B"},
		},
	}
	s.updateClusterEndpoints(cluster)

	// Test 1: Extract model from body for Model A
	bodyA := []byte(`{"model": "DeepSeek-V4-Flash-0731-w8a8", "messages": [{"role": "user", "content": "hi"}]}`)
	reqA, _ := http.NewRequest(http.MethodPost, "http://localhost:8000/v1/chat/completions", bytes.NewReader(bodyA))

	mNameA, _ := extractModelFromRequest(reqA)
	if mNameA != "DeepSeek-V4-Flash-0731-w8a8" {
		t.Fatalf("expected extracted model DeepSeek-V4-Flash-0731-w8a8, got %q", mNameA)
	}

	poolA, err := s.findModelPool(mNameA)
	if err != nil {
		t.Fatalf("failed to find pool for Model A: %v", err)
	}
	if len(poolA.Targets) != 2 {
		t.Errorf("expected 2 targets for Model A, got %d", len(poolA.Targets))
	}

	// Test 2: Extract model from body for Model B (case-insensitive)
	bodyB := []byte(`{"model": "qwen3.6-27b", "messages": []}`)
	reqB, _ := http.NewRequest(http.MethodPost, "http://localhost:8000/v1/chat/completions", bytes.NewReader(bodyB))

	mNameB, _ := extractModelFromRequest(reqB)
	poolB, err := s.findModelPool(mNameB)
	if err != nil {
		t.Fatalf("failed to find pool for Model B: %v", err)
	}
	if poolB.ModelName != "Qwen3.6-27B" {
		t.Errorf("expected Qwen3.6-27B, got %s", poolB.ModelName)
	}

	// Test 3: Model does not exist
	_, errNonExistent := s.findModelPool("non-existent-model")
	if errNonExistent == nil {
		t.Error("expected error for non-existent model")
	}

	// Test 4: Verify /v1/models response
	rw := httptest.NewRecorder()
	reqModels, _ := http.NewRequest(http.MethodGet, "http://localhost:8000/v1/models", nil)
	s.handleModels(rw, reqModels)

	if rw.Code != http.StatusOK {
		t.Fatalf("expected 200 for /v1/models, got %d", rw.Code)
	}

	var resp struct {
		Object string `json:"object"`
		Data   []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rw.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse /v1/models response: %v", err)
	}

	if len(resp.Data) != 2 {
		t.Fatalf("expected 2 models in /v1/models response, got %d", len(resp.Data))
	}

	_ = context.Background()
	_ = targetA1
	_ = targetA2
	_ = targetB1
}
