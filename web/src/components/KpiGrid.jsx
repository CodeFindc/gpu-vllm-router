import React from 'react';

export default function KpiGrid({ data }) {
  const modelsCount = data?.total_models || 0;
  const workersTotal = data?.total_workers || 0;
  const workersHealthy = data?.healthy_workers || 0;
  const conns = data?.total_active_conns || 0;
  const tripped = Math.max(0, workersTotal - workersHealthy);

  return (
    <section className="kpi-grid">
      <div className="kpi-card blue">
        <span className="kpi-label">已纳管模型数量 (Active Models)</span>
        <div className="kpi-val">{modelsCount}</div>
        <span className="kpi-sub">全集群多模型自动聚合纳管</span>
      </div>

      <div className="kpi-card green">
        <span className="kpi-label">Worker 实例健康率 (Healthy Workers)</span>
        <div className="kpi-val">{workersHealthy} / {workersTotal}</div>
        <span className="kpi-sub">实时工作节点就绪状态</span>
      </div>

      <div className="kpi-card purple">
        <span className="kpi-label">集群实时活跃并发 (In-Flight Conns)</span>
        <div className="kpi-val">{conns}</div>
        <span className="kpi-sub">当前正在处理的推理请求总数</span>
      </div>

      <div className="kpi-card amber">
        <span className="kpi-label">熔断器隔离节点 (Tripped Open)</span>
        <div className="kpi-val">{tripped}</div>
        <span className="kpi-sub">主动健康嗅探与自动恢复中</span>
      </div>
    </section>
  );
}
