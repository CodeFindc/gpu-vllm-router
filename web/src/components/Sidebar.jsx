import React from 'react';

export default function Sidebar({
  activeTab,
  onTabChange,
  data,
  refreshMs,
  onRefreshChange,
  onManualRefresh,
}) {
  const mode = (data?.mode || 'proxy').toUpperCase();

  const navItems = [
    { id: 'topology', label: '架构拓扑', icon: '🌐' },
    { id: 'workers', label: 'Worker 负载', icon: '📊' },
    { id: 'playground', label: '推理测试', icon: '💬' },
    { id: 'metrics', label: '监控指标', icon: '📈' },
  ];

  return (
    <aside className="sidebar">
      <div>
        {/* macOS Traffic Light Window Controls */}
        <div className="window-controls">
          <span className="traffic-dot dot-red" title="Close" />
          <span className="traffic-dot dot-yellow" title="Minimize" />
          <span className="traffic-dot dot-green" title="Zoom" />
        </div>

        {/* Brand Header */}
        <div className="sidebar-brand">
          <span className="brand-icon">⚡</span>
          <div className="brand-info">
            <span className="brand-name">GPU-vLLM Router</span>
            <span className="brand-mode-pill">{mode} MODE</span>
          </div>
        </div>

        {/* Primary Navigation */}
        <div className="sidebar-section-title">核心功能</div>
        <nav className="sidebar-menu">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => onTabChange(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* API & Docs External Links */}
        <div className="sidebar-section-title">开发与文档</div>
        <div className="sidebar-menu">
          <a
            href="/docs"
            target="_blank"
            rel="noreferrer"
            className="ext-link"
            title="Swagger UI Interactive Documentation"
          >
            <span>📘 Swagger 交互文档</span>
            <span className="ext-arrow">↗</span>
          </a>
          <a
            href="/redoc"
            target="_blank"
            rel="noreferrer"
            className="ext-link"
            title="ReDoc API Specification"
          >
            <span>📑 ReDoc 规范接口</span>
            <span className="ext-arrow">↗</span>
          </a>
          <a
            href="/healthz"
            target="_blank"
            rel="noreferrer"
            className="ext-link"
            title="Health Check Endpoint"
          >
            <span>🩺 健康状态探针</span>
            <span className="ext-arrow">↗</span>
          </a>
          <a
            href="/openapi.json"
            target="_blank"
            rel="noreferrer"
            className="ext-link"
            title="Raw OpenAPI 3.0 Schema"
          >
            <span>📋 OpenAPI Schema</span>
            <span className="ext-arrow">↗</span>
          </a>
        </div>
      </div>

      {/* Footer Refresh & System Info */}
      <div className="sidebar-footer">
        <div className="footer-row">
          <span>刷新频率</span>
          <select
            className="control-select"
            value={refreshMs}
            onChange={(e) => onRefreshChange(Number(e.target.value))}
          >
            <option value={1000}>1 秒</option>
            <option value={2000}>2 秒</option>
            <option value={5000}>5 秒</option>
            <option value={10000}>10 秒</option>
            <option value={0}>暂停自动</option>
          </select>
        </div>
        <button className="btn-refresh" onClick={onManualRefresh}>
          <span>🔄</span>
          <span>立即手动同步</span>
        </button>
        <div className="footer-row" style={{ fontSize: '10px', color: 'var(--text-dim)', justifyContent: 'center' }}>
          <span>v2.1 · Consistent Hash</span>
        </div>
      </div>
    </aside>
  );
}
