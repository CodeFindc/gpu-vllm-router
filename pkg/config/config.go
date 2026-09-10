package config

import (
	"fmt"
	"os"
	"time"

	"gopkg.in/yaml.v3"
)

// GPUStackConfig holds settings for connecting to GPUStack.
type GPUStackConfig struct {
	BaseURL  string        `yaml:"base_url"`
	Username string        `yaml:"username"`
	Password string        `yaml:"password"`
	APIKey   string        `yaml:"api_key"`
	Timeout  time.Duration `yaml:"timeout"`
}

// TargetConfig holds settings for the model to be routed.
type TargetConfig struct {
	ModelName string `yaml:"model_name"`
	Policy    string `yaml:"policy"`
}

// RouterConfig holds settings for the router service.
type RouterConfig struct {
	Mode             string        `yaml:"mode"`
	Host             string        `yaml:"host"`
	Port             int           `yaml:"port"`
	RouterBin        string        `yaml:"router_bin"`
	WatchInterval    time.Duration `yaml:"watch_interval"`
	DataParallelSize int           `yaml:"data_parallel_size"`
	ZeroDowntime     *bool         `yaml:"zero_downtime"`
	DrainTimeout     time.Duration `yaml:"drain_timeout"`
}

// CircuitBreakerConfig holds settings for circuit breaker and failover.
type CircuitBreakerConfig struct {
	Enabled             *bool         `yaml:"enabled"`
	MaxFailures         int           `yaml:"max_failures"`
	Cooldown            time.Duration `yaml:"cooldown"`
	MaxRetries          int           `yaml:"max_retries"`
	HealthCheckInterval time.Duration `yaml:"health_check_interval"`
}

// FileConfig represents the full structure of config.yaml.
type FileConfig struct {
	GPUStack       GPUStackConfig       `yaml:"gpustack"`
	Target         TargetConfig         `yaml:"target"`
	Router         RouterConfig         `yaml:"router"`
	CircuitBreaker CircuitBreakerConfig `yaml:"circuit_breaker"`
}

// LoadConfig reads and parses a YAML configuration file.
func LoadConfig(path string) (*FileConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file %q: %w", path, err)
	}

	var cfg FileConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse YAML config file %q: %w", path, err)
	}

	return &cfg, nil
}
