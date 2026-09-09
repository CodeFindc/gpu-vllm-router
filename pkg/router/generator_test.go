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
