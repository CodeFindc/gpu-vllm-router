package dashboard

import _ "embed"

// DashboardHTML is the embedded single-page React web console for gpu-vllm-router.
//
//go:embed dist/index.html
var DashboardHTML string
