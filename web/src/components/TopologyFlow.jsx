import React from 'react';

export default function TopologyFlow({ data }) {
  const models = data?.models || [];

  if (models.length === 0) {
    return (
      <section className="section-card">
        <div className="section-header">
          <span className="section-title">🌐 多模型路由架构拓扑流 (Model Routing Architecture Topology)</span>
          <span className="badge badge-blue">动态调度与会话粘性 (X-Session-ID)</span>
        </div>
        <div className="topology-container" style={{ textAlign: 'center', color: 'var(--text-dim)' }}>
          集群内暂未发现运行中的模型与 Worker 实例
        </div>
      </section>
    );
  }

  // Collect worker nodes for visual stage (up to 4)
  const previewWorkers = [];
  models.forEach((m) => {
    (m.workers || []).forEach((w) => {
      if (previewWorkers.length < 4) {
        previewWorkers.push({ ...w, modelName: m.model_name });
      }
    });
  });

  return (
    <section className="section-card">
      <div className="section-header">
        <span className="section-title">🌐 多模型路由架构拓扑流 (Model Routing Architecture Topology)</span>
        <span className="badge badge-blue">动态调度与会话粘性 (X-Session-ID)</span>
      </div>
      <div className="topology-container">
        <div className="topo-flow">
          {/* Stage 1: Clients */}
          <div className="topo-stage">
            <div className="topo-stage-header">1. 业务客户端调用层</div>
            <div className="topo-node">
              <div className="topo-node-title">
                <span>📱 Client Apps / WebUI</span>
                <span className="badge badge-blue">REST / SSE</span>
              </div>
              <div className="topo-node-meta">
                POST /v1/chat/completions<br />
                X-Session-ID: 会话粘性
              </div>
            </div>
          </div>

          <div className="topo-arrow">➔</div>

          {/* Stage 2: Gateway */}
          <div className="topo-stage">
            <div className="topo-stage-header">2. 动态路由调度核心</div>
            <div className="topo-node" style={{ borderColor: 'var(--accent-blue)' }}>
              <div className="topo-node-title">
                <span>🚀 gpu-vllm-router</span>
                <span className="badge badge-green">{(data?.mode || 'proxy').toUpperCase()}</span>
              </div>
              <div className="topo-node-meta">
                监听地址: {data?.public_addr || '0.0.0.0:8000'}<br />
                负载策略: {data?.policy || 'consistent_hash'}<br />
                总并发: {data?.total_active_conns || 0} reqs
              </div>
            </div>
          </div>

          <div className="topo-arrow">➔</div>

          {/* Stage 3: Models */}
          <div className="topo-stage">
            <div className="topo-stage-header">3. 模型路由池 ({models.length} Models)</div>
            {models.map((m) => (
              <div key={m.model_name} className="topo-node">
                <div className="topo-node-title">
                  <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.model_name}
                  </span>
                  <span className="badge badge-blue">{m.worker_count} 节点</span>
                </div>
                <div className="topo-node-meta">
                  活跃连接: {m.active_conns || 0} | 策略: {m.policy}
                </div>
              </div>
            ))}
          </div>

          <div className="topo-arrow">➔</div>

          {/* Stage 4: Workers */}
          <div className="topo-stage">
            <div className="topo-stage-header">4. 推理 Worker 节点 ({data?.total_workers || 0} Instances)</div>
            {previewWorkers.map((w, idx) => {
              const isClosed = w.circuit_state === 'CLOSED' || w.healthy;
              const badgeClass = isClosed ? 'badge-green' : (w.circuit_state === 'HALF_OPEN' ? 'badge-amber' : 'badge-red');
              const stateStr = w.circuit_state || (w.healthy ? 'CLOSED' : 'OPEN');
              return (
                <div
                  key={idx}
                  className="topo-node"
                  style={{ borderColor: isClosed ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)' }}
                >
                  <div className="topo-node-title">
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{w.url}</span>
                    <span className={`badge ${badgeClass}`}>{stateStr}</span>
                  </div>
                  <div className="topo-node-meta">并发负载: {w.active_conns} reqs</div>
                </div>
              );
            })}
            {(data?.total_workers || 0) > 4 && (
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', textAlign: 'center' }}>
                ... 及其余 {(data?.total_workers || 0) - 4} 个节点 (见下方明细)
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
