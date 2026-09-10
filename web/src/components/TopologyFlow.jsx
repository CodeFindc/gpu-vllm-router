import React, { useState } from 'react';

export default function TopologyFlow({ data, onCopy }) {
  const [selectedModel, setSelectedModel] = useState(null);
  const models = data?.models || [];

  if (models.length === 0) {
    return (
      <section className="glass-panel">
        <div className="panel-header">
          <div className="panel-title">
            <span>🌐</span>
            <span>多模型路由架构拓扑流 (Model Routing Architecture Topology)</span>
          </div>
          <span className="badge-pill pill-blue">动态端点调度</span>
        </div>
        <div className="topology-canvas" style={{ textAlign: 'center', padding: '48px', color: 'var(--text-dim)' }}>
          GPUStack 集群内暂未发现运行中的模型与 Worker 实例，等待后端同步...
        </div>
      </section>
    );
  }

  // Flatten all workers with modelName attached
  const allWorkers = [];
  models.forEach((m) => {
    (m.workers || []).forEach((w) => {
      allWorkers.push({ ...w, modelName: m.model_name, policy: m.policy });
    });
  });

  // Filter workers based on selected model
  const displayedWorkers = selectedModel
    ? allWorkers.filter((w) => w.modelName === selectedModel)
    : allWorkers;

  return (
    <section className="glass-panel">
      <div className="panel-header">
        <div className="panel-title">
          <span>🌐</span>
          <span>多模型路由架构拓扑流 (Model Routing Architecture Topology)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="badge-pill pill-blue">会话前缀粘性 (X-Session-ID)</span>
          <span className="badge-pill pill-green">断路器容灾集成</span>
        </div>
      </div>

      <div className="topology-canvas">
        <div className="topo-flow">
          {/* Stage 1: Client Applications (Fixed 200px) */}
          <div className="topo-stage topo-stage-clients">
            <div className="topo-stage-header">
              <span className="topo-stage-title">1. 业务接入层</span>
              <span className="badge-pill pill-blue" style={{ fontSize: '10px' }}>Clients</span>
            </div>
            <div className="topo-stage-body">
              <div className="topo-node">
                <div className="topo-node-title">
                  <span className="topo-node-name">📱 业务端 / SDK</span>
                  <span className="badge-pill pill-blue" style={{ fontSize: '10px' }}>REST</span>
                </div>
                <div className="topo-node-meta">
                  端点: <code>/v1/chat/completions</code><br />
                  标头: <code>X-Session-ID</code><br />
                  机制: 会话前缀 KV 缓存亲和
                </div>
              </div>
            </div>
          </div>

          {/* Connector 1 */}
          <div className="topo-connector">
            <span className="topo-arrow">➔</span>
          </div>

          {/* Stage 2: Router Gateway Hub (Fixed 230px) */}
          <div className="topo-stage topo-stage-router">
            <div className="topo-stage-header">
              <span className="topo-stage-title">2. 调度网关核心</span>
              <span className="badge-pill pill-green" style={{ fontSize: '10px' }}>
                {(data?.mode || 'proxy').toUpperCase()}
              </span>
            </div>
            <div className="topo-stage-body">
              <div
                className="topo-node"
                style={{
                  borderColor: 'var(--apple-blue)',
                  boxShadow: '0 4px 14px rgba(0, 113, 227, 0.12)',
                }}
              >
                <div className="topo-node-title">
                  <span className="topo-node-name">⚡ gpu-vllm-router</span>
                </div>
                <div className="topo-node-meta">
                  监听端点: <code>{data?.public_addr || '0.0.0.0:8000'}</code><br />
                  调度策略: <strong>{data?.policy || 'consistent_hash'}</strong><br />
                  集群并发: <strong>{data?.total_active_conns || 0}</strong> reqs<br />
                  容灾机制: 动态断路器隔离 (Circuit Breaker)
                </div>
              </div>
            </div>
          </div>

          {/* Connector 2 */}
          <div className="topo-connector">
            <span className="topo-arrow">➔</span>
          </div>

          {/* Stage 3: Models Route Pool (Fixed 260px) */}
          <div className="topo-stage topo-stage-models">
            <div className="topo-stage-header">
              <span className="topo-stage-title">3. 模型路由池 ({models.length})</span>
              {selectedModel && (
                <button
                  className="btn-micro"
                  onClick={() => setSelectedModel(null)}
                  style={{ padding: '1px 6px', fontSize: '10px' }}
                  title="清除筛选，展示所有 Worker"
                >
                  全部
                </button>
              )}
            </div>
            <div className="topo-stage-body">
              {models.map((m) => {
                const isSelected = selectedModel === m.model_name;
                return (
                  <div
                    key={m.model_name}
                    className={`topo-node topo-node-clickable ${isSelected ? 'active-selected' : ''}`}
                    onClick={() =>
                      setSelectedModel(isSelected ? null : m.model_name)
                    }
                    title="点击联动筛选右侧 Worker 节点"
                  >
                    <div className="topo-node-title">
                      <span className="topo-node-name">🧠 {m.model_name}</span>
                      <span className="badge-pill pill-blue" style={{ fontSize: '10px' }}>
                        {m.healthy_count}/{m.worker_count} 节点
                      </span>
                    </div>
                    <div className="topo-node-meta">
                      活跃连接: <strong>{m.active_conns || 0}</strong> | 策略: {m.policy}
                    </div>
                    <div
                      style={{
                        marginTop: '4px',
                        fontSize: '10px',
                        color: isSelected ? 'var(--apple-blue)' : 'var(--text-dim)',
                        fontWeight: isSelected ? 600 : 400,
                      }}
                    >
                      {isSelected ? '👉 已联动右侧 Worker' : '点击聚焦关联 Worker ➔'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Connector 3 */}
          <div className="topo-connector">
            <span className="topo-arrow">➔</span>
          </div>

          {/* Stage 4: Backend Inference Workers (Flex: 1, generous space) */}
          <div className="topo-stage topo-stage-workers">
            <div className="topo-stage-header">
              <span className="topo-stage-title">
                4. 推理 Worker 实例 ({displayedWorkers.length}/{allWorkers.length})
              </span>
              {selectedModel && (
                <span className="badge-pill pill-amber" style={{ fontSize: '10px' }}>
                  筛选: {selectedModel}
                </span>
              )}
            </div>
            <div className="topo-stage-body">
              {displayedWorkers.length === 0 ? (
                <div className="topo-node" style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '24px' }}>
                  暂无匹配的后端 Worker 节点
                </div>
              ) : (
                displayedWorkers.map((w, idx) => {
                  const isClosed = w.circuit_state === 'CLOSED' || w.healthy;
                  const pillClass = isClosed
                    ? 'pill-green'
                    : w.circuit_state === 'HALF_OPEN'
                    ? 'pill-amber'
                    : 'pill-red';
                  const stateStr = w.circuit_state || (w.healthy ? 'CLOSED' : 'OPEN');

                  const conn = w.active_conns || 0;
                  const pct = Math.min(100, Math.max(0, (conn / 20) * 100));
                  const fillClass = pct > 70 ? 'high' : pct > 30 ? 'med' : '';

                  return (
                    <div key={idx} className="topo-node">
                      <div className="topo-node-title">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '12px',
                              fontWeight: 600,
                              color: 'var(--apple-blue)',
                              wordBreak: 'break-all',
                            }}
                          >
                            {w.url}
                          </span>
                          {onCopy && (
                            <button
                              className="btn-copy"
                              onClick={() => onCopy(w.url)}
                              title="复制 Worker URL"
                            >
                              复制
                            </button>
                          )}
                        </div>
                        <span className={`badge-pill ${pillClass}`} style={{ fontSize: '10px' }}>
                          {stateStr}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                        <span className="badge-pill pill-blue" style={{ fontSize: '10px' }}>
                          🧠 {w.modelName}
                        </span>
                        {w.consecutive_failures > 0 && (
                          <span className="badge-pill pill-amber" style={{ fontSize: '10px' }}>
                            连续异常: {w.consecutive_failures}
                          </span>
                        )}
                      </div>

                      {/* Mini Concurrency Load Bar */}
                      <div className="topo-worker-bar">
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '52px' }}>
                          并发负载:
                        </span>
                        <div className="load-bar" style={{ flex: 1, maxWidth: '160px' }}>
                          <div
                            className={`load-bar-fill ${fillClass}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="load-text">{conn} reqs</span>
                        {w.last_probe && (
                          <span style={{ fontSize: '10px', color: 'var(--text-dim)', marginLeft: 'auto' }}>
                            探针: {w.last_probe}
                          </span>
                        )}
                      </div>

                      {w.last_error && (
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'var(--apple-red)',
                            marginTop: '4px',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          异常: {w.last_error}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
