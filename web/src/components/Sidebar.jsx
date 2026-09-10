import React from 'react';

export default function Sidebar({
  activeTab,
  onTabChange,
  data,
  refreshMs,
  onRefreshChange,
  onManualRefresh,
}) {
  const modeChinese = data?.mode === 'run' ? '官方守护模式' : '反向代理模式';

  const navItems = [
    { id: 'topology', label: '架构拓扑', icon: '🌐' },
    { id: 'workers', label: '节点负载', icon: '📊' },
    { id: 'rules', label: '规则与参数', icon: '⚙️' },
    { id: 'playground', label: '推理测试', icon: '💬' },
    { id: 'metrics', label: '监控指标', icon: '📈' },
  ];

  return (
    <aside className="sidebar">
      <div>
        {/* macOS Traffic Light Window Controls */}
        <div className="window-controls">
          <span className="traffic-dot dot-red" title="关闭" />
          <span className="traffic-dot dot-yellow" title="最小化" />
          <span className="traffic-dot dot-green" title="全屏" />
        </div>

        {/* Brand Header */}
        <div className="sidebar-brand">
          <span className="brand-icon">⚡</span>
          <div className="brand-info">
            <span className="brand-name">GPU-vLLM Router</span>
            <span className="brand-mode-pill">{modeChinese}</span>
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
            title="Swagger 交互式 API 调试文档"
          >
            <span>📘 Swagger 交互文档</span>
            <span className="ext-arrow">↗</span>
          </a>
          <a
            href="/redoc"
            target="_blank"
            rel="noreferrer"
            className="ext-link"
            title="ReDoc 技术参考规范"
          >
            <span>📑 ReDoc 技术规范</span>
            <span className="ext-arrow">↗</span>
          </a>
          <a
            href="/healthz"
            target="_blank"
            rel="noreferrer"
            className="ext-link"
            title="健康检查状态探针"
          >
            <span>🩺 服务健康探针</span>
            <span className="ext-arrow">↗</span>
          </a>
          <a
            href="/openapi.json"
            target="_blank"
            rel="noreferrer"
            className="ext-link"
            title="OpenAPI 3.0 原始规范定义"
          >
            <span>📋 OpenAPI 结构定义</span>
            <span className="ext-arrow">↗</span>
          </a>
        </div>
      </div>

      {/* Footer Refresh & System Info */}
      <div className="sidebar-footer">
        <div className="footer-row">
          <span>自动刷新</span>
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
          <span>版本 v2.1 · 一致性哈希调度</span>
        </div>
      </div>
    </aside>
  );
}
