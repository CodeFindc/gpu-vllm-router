import React from 'react';

export default function Navbar({ data, refreshMs, onRefreshChange, onManualRefresh, onOpenPlayground }) {
  const mode = (data?.mode || 'proxy').toUpperCase();
  const policy = (data?.policy || 'consistent_hash').toUpperCase();
  const health = data?.cluster_health || 'healthy';

  const healthBadge = {
    healthy: { class: 'badge badge-green', text: '🟢 HEALTHY' },
    degraded: { class: 'badge badge-amber', text: '🟡 DEGRADED' },
    unhealthy: { class: 'badge badge-red', text: '🔴 UNHEALTHY' },
  }[health] || { class: 'badge badge-green', text: '🟢 HEALTHY' };

  return (
    <header className="topbar">
      <div className="brand-group">
        <span className="brand-logo">🚀</span>
        <div>
          <div className="brand-title">GPUStack vLLM Router</div>
        </div>
        <span className="brand-subtitle">MODE: {mode}</span>
        <span className="badge badge-blue">POLICY: {policy}</span>
        <span className={healthBadge.class}>{healthBadge.text}</span>
      </div>

      <div className="top-actions">
        <div className="refresh-control">
          <span>🔄 刷新间隔:</span>
          <select
            className="refresh-select"
            value={refreshMs}
            onChange={(e) => onRefreshChange(Number(e.target.value))}
          >
            <option value={2000}>2 秒</option>
            <option value={5000}>5 秒</option>
            <option value={10000}>10 秒</option>
            <option value={0}>暂停轮询</option>
          </select>
        </div>

        <button className="btn-action" onClick={onManualRefresh}>
          ⚡ 立即刷新
        </button>

        <button className="btn-action" onClick={onOpenPlayground}>
          💬 测试推理
        </button>

        <div style={{ height: '18px', width: '1px', background: 'var(--border-color)' }}></div>

        <a href="/docs" className="nav-link-btn" target="_blank" rel="noreferrer">📖 Swagger UI</a>
        <a href="/redoc" className="nav-link-btn" target="_blank" rel="noreferrer">📑 ReDoc</a>
        <a href="/metrics" className="nav-link-btn" target="_blank" rel="noreferrer">📈 Prometheus</a>
        <a href="/health" className="nav-link-btn" target="_blank" rel="noreferrer">🟢 Health</a>
      </div>
    </header>
  );
}
