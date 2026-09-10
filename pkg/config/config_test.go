package config

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestLoadConfig(t *testing.T) {
	yamlContent := `
gpustack:
  base_url: "http://192.168.1.100:8200"
  username: "admin"
  password: "password123"
  api_key: "test-key"
  timeout: 5s

target:
  model_name: "test-model"
  policy: "consistent_hash"

router:
  mode: "run"
  host: "0.0.0.0"
  port: 8080
  router_bin: "vllm-router"
  watch_interval: 15s
  data_parallel_size: 2
  zero_downtime: true
  drain_timeout: 45s
`
	tmpDir := t.TempDir()
	tmpFile := filepath.Join(tmpDir, "config.yaml")
	if err := os.WriteFile(tmpFile, []byte(yamlContent), 0644); err != nil {
		t.Fatalf("failed to write temp config: %v", err)
	}

	cfg, err := LoadConfig(tmpFile)
	if err != nil {
		t.Fatalf("LoadConfig returned error: %v", err)
	}

	if cfg.GPUStack.BaseURL != "http://192.168.1.100:8200" {
		t.Errorf("expected base_url http://192.168.1.100:8200, got %s", cfg.GPUStack.BaseURL)
	}
	if cfg.GPUStack.Username != "admin" {
		t.Errorf("expected username admin, got %s", cfg.GPUStack.Username)
	}
	if cfg.GPUStack.Timeout != 5*time.Second {
		t.Errorf("expected timeout 5s, got %v", cfg.GPUStack.Timeout)
	}
	if cfg.Target.ModelName != "test-model" {
		t.Errorf("expected model test-model, got %s", cfg.Target.ModelName)
	}
	if cfg.Router.Port != 8080 {
		t.Errorf("expected port 8080, got %d", cfg.Router.Port)
	}
	if cfg.Router.ZeroDowntime == nil || !*cfg.Router.ZeroDowntime {
		t.Errorf("expected zero_downtime true, got %v", cfg.Router.ZeroDowntime)
	}
	if cfg.Router.DrainTimeout != 45*time.Second {
		t.Errorf("expected drain_timeout 45s, got %v", cfg.Router.DrainTimeout)
	}
}

func TestSaveAndLoadConfigWithModels(t *testing.T) {
	tmpDir := t.TempDir()
	cfgFile := filepath.Join(tmpDir, "config.yaml")

	zeroDown := true
	cfg := &FileConfig{
		GPUStack: GPUStackConfig{
			BaseURL: "http://127.0.0.1:8200",
		},
		Target: TargetConfig{
			Policy: "consistent_hash",
		},
		Router: RouterConfig{
			Mode:         "proxy",
			Host:         "0.0.0.0",
			Port:         8000,
			ZeroDowntime: &zeroDown,
		},
		CircuitBreaker: CircuitBreakerConfig{
			MaxFailures: 3,
			Cooldown:    10 * time.Second,
		},
		Models: []ModelRule{
			{ModelName: "DeepSeek-V4", Mode: "proxy", Policy: "consistent_hash"},
			{ModelName: "Qwen3.6-27B", Mode: "run", Policy: "power_of_two"},
		},
	}

	if err := SaveConfig(cfgFile, cfg); err != nil {
		t.Fatalf("SaveConfig failed: %v", err)
	}

	loaded, err := LoadConfig(cfgFile)
	if err != nil {
		t.Fatalf("LoadConfig failed: %v", err)
	}

	if loaded.Router.Mode != "proxy" {
		t.Errorf("expected router.mode proxy, got %s", loaded.Router.Mode)
	}
	if len(loaded.Models) != 2 {
		t.Fatalf("expected 2 models, got %d", len(loaded.Models))
	}
	if loaded.Models[0].ModelName != "DeepSeek-V4" || loaded.Models[0].Mode != "proxy" {
		t.Errorf("unexpected model 0: %+v", loaded.Models[0])
	}
	if loaded.Models[1].ModelName != "Qwen3.6-27B" || loaded.Models[1].Mode != "run" {
		t.Errorf("unexpected model 1: %+v", loaded.Models[1])
	}
}
