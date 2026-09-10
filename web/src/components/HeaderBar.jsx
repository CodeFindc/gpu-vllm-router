import React from 'react';

const TAB_TITLES = {
  topology: {
    title: '🌐 多模型路由架构拓扑流',
    sub: '动态端点调度、前缀缓存亲和性与 X-Session-ID 粘性分析',
  },
  workers: {
    title: '📊 各模型推理集群与 Worker 节点负载明细',
    sub: '实时并发连接深度跟踪、断路器隔离状态与在线微调运维',
  },
  playground: {
    title: '💬 在线快速推理测试沙箱',
    sub: 'OpenAI 协议兼容测试、会话粘性验证与端到端延迟统计',
  },
  metrics: {
    title: '📈 系统指标与集群拓扑',
    sub: 'Prometheus 监控度量集成与底层集群原始 JSON 架构视图',
  },
};

export default function HeaderBar({
  activeTab,
  searchQuery,
  onSearchChange,
  data,
  lastUpdated,
}) {
  const meta = TAB_TITLES[activeTab] || TAB_TITLES.topology;
  const total = data?.total_workers || 0;
  const healthy = data?.healthy_workers || 0;

  let healthPill = { class: 'pill-green', text: '🟢 集群运行健康' };
  if (total === 0) {
    healthPill = { class: 'pill-amber', text: '⚪ 节点探测等待中' };
  } else if (healthy === 0) {
    healthPill = { class: 'pill-red', text: '🔴 集群节点中断' };
  } else if (healthy < total) {
    healthPill = { class: 'pill-amber', text: `🟡 ${total - healthy} 节点熔断隔离` };
  }

  return (
    <header className="header-bar">
      <div className="header-left">
        <h1 className="header-title">{meta.title}</h1>
        <span className="header-subtitle">{meta.sub}</span>
      </div>

      <div className="header-right">
        {/* Search Bar */}
        <div className="search-input-wrap">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="搜索模型或 Worker 端点..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {/* Global Cluster Health Pill */}
        <span className={`badge-pill ${healthPill.class}`}>
          {healthPill.text}
        </span>

        {/* Last Updated */}
        {lastUpdated && (
          <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            {lastUpdated}
          </span>
        )}
      </div>
    </header>
  );
}
