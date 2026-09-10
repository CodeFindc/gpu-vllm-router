import React, { useState } from 'react';

const POLICY_NAMES = {
  consistent_hash: '一致性哈希',
  round_robin: '轮询分发',
  power_of_two: '最小负载 (P2C)',
  random: '随机分发',
};

export default function TopologyFlow({ data, onCopy }) {
  const [selectedModel, setSelectedModel] = useState(null);
  const [viewMode, setViewMode] = useState('flow'); // 'flow' | 'grouped'
  const models = data?.models || [];

  if (models.length === 0) {
    return (
      <section className="glass-panel">
        <div className="panel-header">
          <div className="panel-title">
            <span>🌐</span>
            <span>多模型路由架构拓扑</span>
          </div>
          <span className="badge-pill pill-blue">动态端点调度</span>
        </div>
        <div className="topology-canvas" style={{ textAlign: 'center', padding: '48px', color: 'var(--text-dim)' }}>
          GPUStack 集群内暂未发现运行中的模型与工作节点实例，等待后端同步...
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

  const modeLabel = data?.mode === 'run' ? '官方守护模式' : '反向代理模式';
  const policyLabel = POLICY_NAMES[data?.policy] || data?.policy || '一致性哈希';

  return (
    <section className="glass-panel">
      <div className="panel-header">
        <div className="panel-title">
          <span>🌐</span>
          <span>多模型路由架构拓扑</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* View Mode Toggle */}
          <div style={{ display: 'inline-flex', background: 'rgba(0,0,0,0.05)', borderRadius: '8px', padding: '2px' }}>
            <button
              className={`btn-micro ${viewMode === 'flow' ? 'active-selected' : ''}`}
              style={{
                borderRadius: '6px',
                padding: '3px 10px',
                border: 'none',
                background: viewMode === 'flow' ? '#fff' : 'transparent',
                boxShadow: viewMode === 'flow' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                color: viewMode === 'flow' ? 'var(--apple-blue)' : 'var(--text-secondary)',
                fontWeight: viewMode === 'flow' ? 600 : 400,
              }}
              onClick={() => setViewMode('flow')}
            >
              ⇄ 流程视图
            </button>
            <button
              className={`btn-micro ${viewMode === 'grouped' ? 'active-selected' : ''}`}
              style={{
                borderRadius: '6px',
                padding: '3px 10px',
                border: 'none',
                background: viewMode === 'grouped' ? '#fff' : 'transparent',
                boxShadow: viewMode === 'grouped' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                color: viewMode === 'grouped' ? 'var(--apple-blue)' : 'var(--text-secondary)',
                fontWeight: viewMode === 'grouped' ? 600 : 400,
              }}
              onClick={() => setViewMode('grouped')}
            >
              ⊞ 层级分组视图
            </button>
          </div>

          <span className="badge-pill pill-blue">会话前缀粘性</span>
          <span className="badge-pill pill-green">断路器容灾</span>
        </div>
      </div>

      <div className="topology-canvas">
        {viewMode === 'flow' ? (
          /* Mode A: Horizontal Pipeline Flow */
          <div className="topo-flow">
            {/* Stage 1: Client Applications */}
            <div className="topo-stage topo-stage-clients">
              <div className="topo-stage-header">
                <span className="topo-stage-title">1. 业务接入层</span>
                <span className="badge-pill pill-blue" style={{ fontSize: '10px' }}>接入客户端</span>
              </div>
              <div className="topo-stage-body">
                <div className="topo-node">
                  <div className="topo-node-title">
                    <span className="topo-node-name">业务客户端 / SDK</span>
                  </div>
                  <div className="topo-node-meta">
                    请求接口: <code>/v1/chat/completions</code><br />
                    会话标头: <code>X-Session-ID</code><br />
                    调度机制: 前缀 KV 缓存亲和
                  </div>
                </div>
              </div>
            </div>

            {/* Connector 1 */}
            <div className="topo-connector">
              <span className="topo-arrow">➔</span>
            </div>

            {/* Stage 2: Router Gateway Hub */}
            <div className="topo-stage topo-stage-router">
              <div className="topo-stage-header">
                <span className="topo-stage-title">2. 调度网关核心</span>
                <span className="badge-pill pill-green" style={{ fontSize: '10px' }}>
                  {modeLabel}
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
                    <span className="topo-node-name">⚡ 路由调度核心</span>
                  </div>
                  <div className="topo-node-meta">
                    监听端点: <code>{data?.public_addr || '0.0.0.0:8000'}</code><br />
                    调度策略: <strong>{policyLabel}</strong><br />
                    集群并发: <strong>{data?.total_active_conns || 0}</strong> 个活跃连接<br />
                    容灾隔离: 动态断路器实时保护
                  </div>
                </div>
              </div>
            </div>

            {/* Connector 2 */}
            <div className="topo-connector">
              <span className="topo-arrow">➔</span>
            </div>

            {/* Stage 3: Models Route Pool */}
            <div className="topo-stage topo-stage-models">
              <div className="topo-stage-header">
                <span className="topo-stage-title">3. 模型路由池 ({models.length})</span>
                {selectedModel && (
                  <button
                    className="btn-micro"
                    onClick={() => setSelectedModel(null)}
                    style={{ padding: '1px 6px', fontSize: '10px' }}
                    title="清除筛选，显示全部节点"
                  >
                    全部
                  </button>
                )}
              </div>
              <div className="topo-stage-body">
                {models.map((m) => {
                  const isSelected = selectedModel === m.model_name;
                  const pName = POLICY_NAMES[m.policy] || m.policy;
                  return (
                    <div
                      key={m.model_name}
                      className={`topo-node topo-node-clickable ${isSelected ? 'active-selected' : ''}`}
                      onClick={() =>
                        setSelectedModel(isSelected ? null : m.model_name)
                      }
                      title="点击联动筛选右侧工作节点"
                    >
                      <div className="topo-node-title">
                        <span className="topo-node-name">🧠 {m.model_name}</span>
                        <span className="badge-pill pill-blue" style={{ fontSize: '10px' }}>
                          {m.healthy_count}/{m.worker_count} 节点
                        </span>
                      </div>
                      <div className="topo-node-meta">
                        活跃并发: <strong>{m.active_conns || 0}</strong> | 策略: {pName}
                      </div>
                      <div
                        style={{
                          marginTop: '4px',
                          fontSize: '10px',
                          color: isSelected ? 'var(--apple-blue)' : 'var(--text-dim)',
                          fontWeight: isSelected ? 600 : 400,
                        }}
                      >
                        {isSelected ? '👉 已聚焦右侧节点' : '点击聚焦关联节点 ➔'}
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

            {/* Stage 4: Backend Inference Workers */}
            <div className="topo-stage topo-stage-workers">
              <div className="topo-stage-header">
                <span className="topo-stage-title">
                  4. 推理工作节点 ({displayedWorkers.length}/{allWorkers.length})
                </span>
                {selectedModel && (
                  <span className="badge-pill pill-amber" style={{ fontSize: '10px' }}>
                    已聚焦: {selectedModel}
                  </span>
                )}
              </div>
              <div className="topo-stage-body">
                {displayedWorkers.length === 0 ? (
                  <div className="topo-node" style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '24px' }}>
                    暂无就绪的工作节点
                  </div>
                ) : (
                  displayedWorkers.map((w, idx) => {
                    const isClosed = w.circuit_state === 'CLOSED' || w.healthy;
                    const pillClass = isClosed
                      ? 'pill-green'
                      : w.circuit_state === 'HALF_OPEN'
                      ? 'pill-amber'
                      : 'pill-red';
                    const stateChinese = isClosed
                      ? '🟢 正常'
                      : w.circuit_state === 'HALF_OPEN'
                      ? '🟡 探测中'
                      : '🔴 熔断隔离';

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
                                title="复制端点 URL"
                              >
                                复制
                              </button>
                            )}
                          </div>
                          <span className={`badge-pill ${pillClass}`} style={{ fontSize: '10px' }}>
                            {stateChinese}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                          <span className="badge-pill pill-blue" style={{ fontSize: '10px' }}>
                            模型: {w.modelName}
                          </span>
                          {w.consecutive_failures > 0 && (
                            <span className="badge-pill pill-amber" style={{ fontSize: '10px' }}>
                              连续异常: {w.consecutive_failures} 次
                            </span>
                          )}
                        </div>

                        {/* Mini Concurrency Load Bar */}
                        <div className="topo-worker-bar">
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '52px' }}>
                            并发负载:
                          </span>
                          <div className="load-bar" style={{ flex: 1, maxWidth: '140px' }}>
                            <div
                              className={`load-bar-fill ${fillClass}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="load-text">{conn} 请求</span>
                          {w.last_probe && (
                            <span style={{ fontSize: '10px', color: 'var(--text-dim)', marginLeft: 'auto' }}>
                              探测: {w.last_probe}
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
                            异常详情: {w.last_error}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Mode B: Grouped Responsive Tree View */
          <div className="topo-grouped-grid">
            {models.map((m) => {
              const pName = POLICY_NAMES[m.policy] || m.policy;
              const workers = m.workers || [];

              return (
                <div key={m.model_name} className="topo-group-card">
                  <div className="topo-group-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700 }}>🧠 {m.model_name}</span>
                      <span className="badge-pill pill-blue">策略: {pName}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="badge-pill pill-green">
                        就绪节点: {m.healthy_count} / {m.worker_count}
                      </span>
                      <span className="badge-pill pill-blue">
                        模型总并发: {m.active_conns || 0} 请求
                      </span>
                    </div>
                  </div>

                  <div className="topo-group-workers-grid">
                    {workers.length === 0 ? (
                      <div style={{ color: 'var(--text-dim)', fontSize: '12px', padding: '12px' }}>
                        暂无注册的工作节点
                      </div>
                    ) : (
                      workers.map((w, idx) => {
                        const isClosed = w.circuit_state === 'CLOSED' || w.healthy;
                        const pillClass = isClosed
                          ? 'pill-green'
                          : w.circuit_state === 'HALF_OPEN'
                          ? 'pill-amber'
                          : 'pill-red';
                        const stateChinese = isClosed
                          ? '🟢 正常'
                          : w.circuit_state === 'HALF_OPEN'
                          ? '🟡 探测中'
                          : '🔴 熔断隔离';

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
                                    title="复制端点 URL"
                                  >
                                    复制
                                  </button>
                                )}
                              </div>
                              <span className={`badge-pill ${pillClass}`} style={{ fontSize: '10px' }}>
                                {stateChinese}
                              </span>
                            </div>

                            <div className="topo-worker-bar">
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                并发:
                              </span>
                              <div className="load-bar" style={{ flex: 1 }}>
                                <div
                                  className={`load-bar-fill ${fillClass}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="load-text">{conn} 请求</span>
                            </div>

                            {w.last_probe && (
                              <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px' }}>
                                最近探测: {w.last_probe}
                              </div>
                            )}

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
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
