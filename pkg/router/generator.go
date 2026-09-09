package router

import (
	"fmt"
	"strings"
)

// Config holds the configuration to construct vllm-router command.
type Config struct {
	RouterBin         string   `json:"router_bin"` // e.g. "vllm-router"
	Host              string   `json:"host"`       // e.g. "0.0.0.0"
	Port              int      `json:"port"`       // e.g. 8000
	Policy            Policy   `json:"policy"`     // e.g. PolicyConsistentHash
	WorkerURLs        []string `json:"worker_urls"`
	DataParallelSize  int      `json:"data_parallel_size"` // default 1
	Backend           string   `json:"backend"`            // default "vllm"
	LogLevel          string   `json:"log_level"`          // default "info"
	VllmPDDisagg      bool     `json:"vllm_pd_disaggregation"`
	PrefillURLs       []string `json:"prefill_urls"`
	DecodeURLs        []string `json:"decode_urls"`
	ExtraArgs         []string `json:"extra_args"`
}

// BuildArgs constructs the slice of command line arguments for vllm-router.
func BuildArgs(cfg Config) []string {
	var args []string

	host := cfg.Host
	if host == "" {
		host = "0.0.0.0"
	}
	args = append(args, "--host", host)

	port := cfg.Port
	if port <= 0 {
		port = 8000
	}
	args = append(args, "--port", fmt.Sprintf("%d", port))

	policy := cfg.Policy
	if policy == "" {
		policy = PolicyConsistentHash
	}
	args = append(args, "--policy", string(policy))

	if cfg.DataParallelSize > 1 {
		args = append(args, "--intra-node-data-parallel-size", fmt.Sprintf("%d", cfg.DataParallelSize))
	}

	if cfg.Backend != "" && cfg.Backend != "vllm" {
		args = append(args, "--backend", cfg.Backend)
	}

	if cfg.LogLevel != "" {
		args = append(args, "--log-level", cfg.LogLevel)
	}

	if cfg.VllmPDDisagg {
		args = append(args, "--vllm-pd-disaggregation")
		for _, u := range cfg.PrefillURLs {
			args = append(args, "--prefill", u)
		}
		for _, u := range cfg.DecodeURLs {
			args = append(args, "--decode", u)
		}
	} else if len(cfg.WorkerURLs) > 0 {
		args = append(args, "--worker-urls")
		args = append(args, cfg.WorkerURLs...)
	}

	if len(cfg.ExtraArgs) > 0 {
		args = append(args, cfg.ExtraArgs...)
	}

	return args
}

// GenerateBashCommand formats the vllm-router command for bash shells.
func GenerateBashCommand(cfg Config) string {
	bin := cfg.RouterBin
	if bin == "" {
		bin = "vllm-router"
	}

	args := BuildArgs(cfg)
	var sb strings.Builder
	sb.WriteString(bin)
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if strings.HasPrefix(arg, "--") {
			sb.WriteString(" \\\n    ")
			sb.WriteString(arg)
		} else {
			sb.WriteString(" ")
			sb.WriteString(arg)
		}
	}
	return sb.String()
}

// GeneratePowerShellCommand formats the vllm-router command for PowerShell.
func GeneratePowerShellCommand(cfg Config) string {
	bin := cfg.RouterBin
	if bin == "" {
		bin = "vllm-router"
	}

	args := BuildArgs(cfg)
	var sb strings.Builder
	sb.WriteString(bin)
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if strings.HasPrefix(arg, "--") {
			sb.WriteString(" `\n    ")
			sb.WriteString(arg)
		} else {
			sb.WriteString(" ")
			sb.WriteString(arg)
		}
	}
	return sb.String()
}

// GenerateDockerCommand formats a docker run command for vllm-router.
func GenerateDockerCommand(cfg Config, imageName string) string {
	if imageName == "" {
		imageName = "vllm/vllm-router:latest"
	}
	port := cfg.Port
	if port <= 0 {
		port = 8000
	}

	args := BuildArgs(cfg)
	return fmt.Sprintf("docker run --rm -it --network host -p %d:%d %s %s",
		port, port, imageName, strings.Join(args, " "))
}
