import React from 'react';

const TAB_TITLES = {
  topology: {
    title: '多模型路由架构拓扑',
    sub: '动态端点调度、前缀缓存亲和性与会话粘性实时流向分析',
  },
  workers: {
    title: '模型集群与工作节点负载明细',
    sub: '实时活跃并发连接跟踪、断路器隔离状态与在线微调运维',
  },
  playground: {
    title: '在线推理测试沙箱',
    sub: 'OpenAI 协议兼容测试、会话粘性验证与端到端延迟统计',
  },
  metrics: {
    title: '系统度量指标与拓扑快照',
    sub: 'Prometheus 监控度量集成与底层集群原始数据架构快照',
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

  let healthPill = { class: 'pill-green', text: '🟢 集群运行良好' };
  if (total === 0) {
    healthPill = { class: 'pill-amber', text: '⚪ 等待节点探测' };
  } else if (healthy === 0) {
    healthPill = { class: 'pill-red', text: '🔴 全集群节点中断' };
  } else if (healthy < total) {
    healthPill = { class: 'pill-amber', text: `🟡 ${total - healthy} 个节点熔断隔离` };
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
            placeholder="搜索模型名称或节点端点..."
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
            最近同步: {lastUpdated}
          </span>
        )}
      </div>
    </header>
  );
}
