package dashboard

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// Handler serves the web dashboard UI and related topology/probe APIs.
type Handler struct {
	provider TopologyProvider
}

// NewHandler creates a new dashboard HTTP handler.
func NewHandler(provider TopologyProvider) *Handler {
	return &Handler{
		provider: provider,
	}
}

// ServeHTTP handles incoming requests for the dashboard and its REST APIs.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path

	// CORS headers for API calls
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Session-ID, X-User-ID")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	switch {
	case path == "/dashboard" || path == "/dashboard/":
		h.handleUI(w, r)
	case path == "/ui" || path == "/ui/":
		http.Redirect(w, r, "/dashboard", http.StatusFound)
	case path == "/api/topology":
		h.handleGetTopology(w, r)
	case path == "/api/probe":
		h.handleProbe(w, r)
	case path == "/api/reset-breaker":
		h.handleResetBreaker(w, r)
	default:
		// If subpath of /dashboard/, serve UI
		if strings.HasPrefix(path, "/dashboard") {
			h.handleUI(w, r)
			return
		}
		http.NotFound(w, r)
	}
}

func (h *Handler) handleUI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(DashboardHTML))
}

func (h *Handler) handleGetTopology(w http.ResponseWriter, r *http.Request) {
	if h.provider == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "topology provider not initialized"})
		return
	}

	data, err := h.provider.GetTopology(r.Context())
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("failed to get topology: %v", err)})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(data)
}

func (h *Handler) handleProbe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ProbeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.URL == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(ProbeResponse{
			Success: false,
			Message: "invalid request body: 'url' is required",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if h.provider == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		_ = json.NewEncoder(w).Encode(ProbeResponse{
			URL:     req.URL,
			Success: false,
			Message: "provider not available",
		})
		return
	}

	ok, err := h.provider.ProbeWorker(r.Context(), req.URL)
	msg := "probe succeeded"
	if !ok || err != nil {
		if err != nil {
			msg = err.Error()
		} else {
			msg = "probe failed"
		}
	}

	resp := ProbeResponse{
		URL:     req.URL,
		Success: ok && err == nil,
		Message: msg,
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}

func (h *Handler) handleResetBreaker(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ResetBreakerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.URL == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(ResetBreakerResponse{
			Success: false,
			Message: "invalid request body: 'url' is required",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if h.provider == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		_ = json.NewEncoder(w).Encode(ResetBreakerResponse{
			URL:     req.URL,
			Success: false,
			Message: "provider not available",
		})
		return
	}

	err := h.provider.ResetBreaker(r.Context(), req.URL)
	msg := "circuit breaker reset to CLOSED"
	if err != nil {
		msg = err.Error()
	}

	resp := ResetBreakerResponse{
		URL:     req.URL,
		Success: err == nil,
		Message: msg,
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}
