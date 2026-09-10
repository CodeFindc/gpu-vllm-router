package router

import (
	"strings"
	"testing"
)

func TestBuildArgs(t *testing.T) {
	cfg := Config{
		Host:       "127.0.0.1",
		Port:       8080,
		Policy:     PolicyConsistentHash,
		WorkerURLs: []string{"http://192.168.1.10:40039", "http://192.168.1.11:40039"},
	}

	args := BuildArgs(cfg)
	cmdStr := strings.Join(args, " ")

	if !strings.Contains(cmdStr, "--host 127.0.0.1") {
		t.Errorf("expected --host 127.0.0.1, got %s", cmdStr)
	}
	if !strings.Contains(cmdStr, "--port 8080") {
		t.Errorf("expected --port 8080, got %s", cmdStr)
	}
	if !strings.Contains(cmdStr, "--policy consistent_hash") {
		t.Errorf("expected --policy consistent_hash, got %s", cmdStr)
	}
	if !strings.Contains(cmdStr, "--worker-urls http://192.168.1.10:40039 http://192.168.1.11:40039") {
		t.Errorf("expected worker URLs in command, got %s", cmdStr)
	}

	bashCmd := GenerateBashCommand(cfg)
	if !strings.HasPrefix(bashCmd, "vllm-router") {
		t.Errorf("expected bash command to start with vllm-router, got %s", bashCmd)
	}

	psCmd := GeneratePowerShellCommand(cfg)
	if !strings.Contains(psCmd, "`") {
		t.Errorf("expected powershell line continuations, got %s", psCmd)
	}
}

func TestParsePolicy(t *testing.T) {
	tests := []struct {
		input    string
		expected Policy
		hasError bool
	}{
		{"round_robin", PolicyRoundRobin, false},
		{"RR", PolicyRoundRobin, false},
		{"consistent_hash", PolicyConsistentHash, false},
		{"consistent-hash", PolicyConsistentHash, false},
		{"cache_aware", PolicyCacheAware, false},
		{"power_of_two", PolicyPowerOfTwo, false},
		{"p2c", PolicyPowerOfTwo, false},
		{"random", PolicyRandom, false},
		{"rendezvous_hash", PolicyRendezvousHash, false},
		{"invalid_policy", "", true},
	}

	for _, tc := range tests {
		p, err := ParsePolicy(tc.input)
		if tc.hasError && err == nil {
			t.Errorf("expected error for %q, got nil", tc.input)
		}
		if !tc.hasError && (err != nil || p != tc.expected) {
			t.Errorf("for input %q: expected %q, got %q (err: %v)", tc.input, tc.expected, p, err)
		}
	}
}

func TestBuildArgsWithCircuitBreaker(t *testing.T) {
	cfg := Config{
		Host:                    "0.0.0.0",
		Port:                    8000,
		Policy:                  PolicyConsistentHash,
		WorkerURLs:              []string{"http://10.0.0.1:8000", "http://10.0.0.2:8000"},
		CbFailureThreshold:      5,
		CbSuccessThreshold:      2,
		CbTimeoutDurationSecs:   30,
		CbWindowDurationSecs:    60,
		RetryMaxRetries:         3,
		RetryInitialBackoffMs:   50,
		HealthCheckIntervalSecs: 10,
		HealthCheckTimeoutSecs:  5,
		HealthCheckEndpoint:     "/health",
	}

	args := BuildArgs(cfg)
	cmdStr := strings.Join(args, " ")

	expectedFlags := []string{
		"--cb-failure-threshold 5",
		"--cb-success-threshold 2",
		"--cb-timeout-duration-secs 30",
		"--cb-window-duration-secs 60",
		"--retry-max-retries 3",
		"--retry-initial-backoff-ms 50",
		"--health-check-interval-secs 10",
		"--health-check-timeout-secs 5",
		"--health-check-endpoint /health",
	}

	for _, flag := range expectedFlags {
		if !strings.Contains(cmdStr, flag) {
			t.Errorf("expected command string to contain %q, but got: %s", flag, cmdStr)
		}
	}

	// Test disable flags
	cfgDisabled := Config{
		Host:                  "0.0.0.0",
		Port:                  8000,
		WorkerURLs:            []string{"http://10.0.0.1:8000"},
		DisableCircuitBreaker: true,
		DisableRetries:        true,
	}
	cmdDisabledStr := strings.Join(BuildArgs(cfgDisabled), " ")
	if !strings.Contains(cmdDisabledStr, "--disable-circuit-breaker") {
		t.Errorf("expected --disable-circuit-breaker in %s", cmdDisabledStr)
	}
	if !strings.Contains(cmdDisabledStr, "--disable-retries") {
		t.Errorf("expected --disable-retries in %s", cmdDisabledStr)
	}
}

func TestBuildArgsWithThresholdsAndExtraArgs(t *testing.T) {
	cfg := Config{
		Host:                "0.0.0.0",
		Port:                8000,
		Policy:              PolicyCacheAware,
		WorkerURLs:          []string{"http://10.0.0.1:8000", "http://10.0.0.2:8000"},
		BalanceAbsThreshold: 4,
		BalanceRelThreshold: 1.1,
		CacheThreshold:      0.6,
		ExtraArgs:           []string{"--request-timeout", "60"},
	}

	args := BuildArgs(cfg)
	cmdStr := strings.Join(args, " ")

	expectedFlags := []string{
		"--policy cache_aware",
		"--balance-abs-threshold 4",
		"--balance-rel-threshold 1.1",
		"--cache-threshold 0.6",
		"--request-timeout 60",
	}

	for _, flag := range expectedFlags {
		if !strings.Contains(cmdStr, flag) {
			t.Errorf("expected command string to contain %q, but got: %s", flag, cmdStr)
		}
	}
}

