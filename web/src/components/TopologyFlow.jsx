import React from 'react';

export default function TopologyFlow({ data }) {
  const models = data?.models || [];

  if (models.length === 0) {
    return (
      <section className="glass-panel">
        <div className="panel-header">
          <div className="panel-title">
            <span>🌐</span>
            <span>多模型路由架构拓扑流 (Model Routing Architecture Topology)</span>
          </div>
          <span className="badge-pill pill-blue">动态调度与会话粘性</span>
        </div>
        <div className="topology-canvas" style={{ textAlign: 'center', padding: '48px', color: 'var(--text-dim)' }}>
          GPUStack 集群内暂未发现运行中的模型与 Worker 实例，等待后端同步...
        </div>
      </section>
    );
  }

  // Collect worker nodes for visual preview stage
  const previewWorkers = [];
  models.forEach((m) => {
    (m.workers || []).forEach((w) => {
      if (previewWorkers.length < 5) {
        previewWorkers.push({ ...w, modelName: m.model_name });
      }
    });
  });

  return (
    <section className="glass-panel">
      <div className="panel-header">
        <div className="panel-title">
          <span>🌐</span>
          <span>多模型路由架构拓扑流 (Model Routing Architecture Topology)</span>
        </div>
        <span className="badge-pill pill-blue">会话前缀粘性 (X-Session-ID)</span>
      </div>

      <div className="topology-canvas">
        <div className="topo-flow">
          {/* Stage 1: Client Applications */}
          <div className="topo-stage">
            <div className="topo-stage-header">1. 业务接入层 (Clients)</div>
            <div className="topo-node">
              <div className="topo-node-title">
                <span>📱 业务端 / 客户端</span>
                <span className="badge-pill pill-blue">REST / SSE</span>
              </div>
              <div className="topo-node-meta">
                POST /v1/chat/completions<br />
                支持 X-Session-ID 前缀粘性
              </div>
            </div>
          </div>

          <div className="topo-arrow">➔</div>

          {/* Stage 2: Gateway & Consistent Hash Core */}
          <div className="topo-stage">
            <div className="topo-stage-header">2. 调度网关核心 (Router Core)</div>
            <div className="topo-node" style={{ borderColor: 'var(--apple-blue)', boxShadow: '0 4px 18px rgba(0, 113, 227, 0.12)' }}>
              <div className="topo-node-title">
                <span>⚡ gpu-vllm-router</span>
                <span className="badge-pill pill-green">{(data?.mode || 'proxy').toUpperCase()}</span>
              </div>
              <div className="topo-node-meta">
                监听端点: {data?.public_addr || '0.0.0.0:8000'}<br />
                负载策略: {data?.policy || 'consistent_hash'}<br />
                活跃并发: {data?.total_active_conns || 0} reqs
              </div>
            </div>
          </div>

          <div className="topo-arrow">➔</div>

          {/* Stage 3: Models Route Pool */}
          <div className="topo-stage">
            <div className="topo-stage-header">3. 模型路由池 ({models.length} Models)</div>
            {models.map((m) => (
              <div key={m.model_name} className="topo-node">
                <div className="topo-node-title">
                  <span
                    style={{
                      maxWidth: '150px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={m.model_name}
                  >
                    🧠 {m.model_name}
                  </span>
                  <span className="badge-pill pill-blue">{m.worker_count} 实例</span>
                </div>
                <div className="topo-node-meta">
                  并发: {m.active_conns || 0} | 健康: {m.healthy_count}/{m.worker_count}
                </div>
              </div>
            ))}
          </div>

          <div className="topo-arrow">➔</div>

          {/* Stage 4: vLLM Backend Workers */}
          <div className="topo-stage">
            <div className="topo-stage-header">
              4. 推理 Worker 实例 ({data?.total_workers || 0} Nodes)
            </div>
            {previewWorkers.map((w, idx) => {
              const isClosed = w.circuit_state === 'CLOSED' || w.healthy;
              const pillClass = isClosed
                ? 'pill-green'
                : w.circuit_state === 'HALF_OPEN'
                ? 'pill-amber'
                : 'pill-red';
              const stateStr = w.circuit_state || (w.healthy ? 'CLOSED' : 'OPEN');

              return (
                <div key={idx} className="topo-node">
                  <div className="topo-node-title">
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        maxWidth: '140px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={w.url}
                    >
                      {w.url.replace('http://', '')}
                    </span>
                    <span className={`badge-pill ${pillClass}`}>{stateStr}</span>
                  </div>
                  <div className="topo-node-meta">
                    并发: {w.active_conns || 0} | 连续失败: {w.consecutive_failures || 0}
                  </div>
                </div>
              );
            })}
            {(data?.total_workers || 0) > previewWorkers.length && (
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', textAlign: 'center' }}>
                + 另有 {(data?.total_workers || 0) - previewWorkers.length} 个 Worker (见负载视图)
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
