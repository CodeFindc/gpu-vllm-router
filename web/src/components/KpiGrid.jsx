import React from 'react';

export default function KpiGrid({ data }) {
  const modelsCount = data?.total_models || 0;
  const workersTotal = data?.total_workers || 0;
  const workersHealthy = data?.healthy_workers || 0;
  const conns = data?.total_active_conns || 0;
  const tripped = Math.max(0, workersTotal - workersHealthy);

  return (
    <section className="kpi-grid">
      <div className="kpi-card">
        <div className="kpi-accent-bar" style={{ background: 'var(--apple-blue)' }} />
        <span className="kpi-label">已纳管模型数量 (Active Models)</span>
        <div className="kpi-val">{modelsCount}</div>
        <span className="kpi-sub">多模型集群动态聚合纳管</span>
      </div>

      <div className="kpi-card">
        <div className="kpi-accent-bar" style={{ background: 'var(--apple-green)' }} />
        <span className="kpi-label">Worker 实例健康率 (Healthy)</span>
        <div className="kpi-val">
          {workersHealthy}{' '}
          <span style={{ fontSize: '18px', color: 'var(--text-dim)', fontWeight: 500 }}>
            / {workersTotal}
          </span>
        </div>
        <span className="kpi-sub">在线就绪的推理工作节点</span>
      </div>

      <div className="kpi-card">
        <div className="kpi-accent-bar" style={{ background: 'var(--apple-purple)' }} />
        <span className="kpi-label">实时活跃并发 (In-Flight Conns)</span>
        <div className="kpi-val">{conns}</div>
        <span className="kpi-sub">全集群正在处理的推理连接</span>
      </div>

      <div className="kpi-card">
        <div
          className="kpi-accent-bar"
          style={{ background: tripped > 0 ? 'var(--apple-red)' : 'var(--apple-amber)' }}
        />
        <span className="kpi-label">熔断隔离节点 (Tripped Open)</span>
        <div
          className="kpi-val"
          style={{ color: tripped > 0 ? 'var(--apple-red)' : 'inherit' }}
        >
          {tripped}
        </div>
        <span className="kpi-sub">后台主动嗅探与自动恢复中</span>
      </div>
    </section>
  );
}
