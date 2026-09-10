import React from 'react';

export default function MetricsView({ data, onCopy }) {
  const jsonString = JSON.stringify(data, null, 2);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Endpoints Quick Access Card */}
      <section className="glass-panel">
        <div className="panel-header">
          <div className="panel-title">
            <span>📈</span>
            <span>Prometheus 监控度量与原生接口集成</span>
          </div>
          <span className="badge-pill pill-blue">OpenMetrics 规范兼容</span>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '240px', background: 'rgba(255,255,255,0.8)', border: '1px solid var(--glass-border-subtle)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
              📊 Prometheus 监控指标
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              暴露请求总数、活跃并发连接数等实时性能监控度量。
            </div>
            <a
              href="/metrics"
              target="_blank"
              rel="noreferrer"
              className="btn-micro"
              style={{ textDecoration: 'none' }}
            >
              打开 /metrics ↗
            </a>
          </div>

          <div style={{ flex: 1, minWidth: '240px', background: 'rgba(255,255,255,0.8)', border: '1px solid var(--glass-border-subtle)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
              ⚡ 集群管理运行状态
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              获取网关级并发连接与模型就绪状态汇总 JSON 数据。
            </div>
            <a
              href="/admin/stats"
              target="_blank"
              rel="noreferrer"
              className="btn-micro"
              style={{ textDecoration: 'none' }}
            >
              查看 /admin/stats ↗
            </a>
          </div>

          <div style={{ flex: 1, minWidth: '240px', background: 'rgba(255,255,255,0.8)', border: '1px solid var(--glass-border-subtle)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
              🩺 服务存活与就绪探针
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              用于容器编排平台健康检查探测端点，返回 200 OK。
            </div>
            <a
              href="/healthz"
              target="_blank"
              rel="noreferrer"
              className="btn-micro"
              style={{ textDecoration: 'none' }}
            >
              探测 /healthz ↗
            </a>
          </div>
        </div>
      </section>

      {/* Raw Topology JSON Panel */}
      <section className="glass-panel">
        <div className="panel-header">
          <div className="panel-title">
            <span>📋</span>
            <span>集群动态拓扑原始快照 (JSON)</span>
          </div>
          <button
            className="btn-micro"
            onClick={() => onCopy(jsonString)}
          >
            📋 复制数据快照
          </button>
        </div>
        <div style={{ padding: '16px 24px' }}>
          <div className="response-box" style={{ maxHeight: '420px', minHeight: '200px' }}>
            {jsonString || '加载中...'}
          </div>
        </div>
      </section>
    </div>
  );
}
