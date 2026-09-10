import React from 'react';

export default function ModelsMatrix({ models, onProbe, onReset, onCopy }) {
  if (!models || models.length === 0) {
    return (
      <section className="glass-panel">
        <div className="panel-header">
          <div className="panel-title">
            <span>📊</span>
            <span>各模型推理集群与 Worker 节点负载明细 (Model Pools & Workers Load)</span>
          </div>
        </div>
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-dim)' }}>
          暂无匹配的模型实例或 Worker 节点
        </div>
      </section>
    );
  }

  return (
    <section className="glass-panel">
      <div className="panel-header">
        <div className="panel-title">
          <span>📊</span>
          <span>各模型推理集群与 Worker 节点负载明细 (Model Pools & Workers Load)</span>
        </div>
        <span className="badge-pill pill-blue">纳管中: {models.length} 个模型池</span>
      </div>

      <div className="models-container">
        {models.map((m) => (
          <div key={m.model_name} className="model-box">
            <div className="model-header">
              <div className="model-name">
                <span>🧠 {m.model_name}</span>
                <span className="badge-pill pill-blue" style={{ fontSize: '11px' }}>
                  策略: {m.policy}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="badge-pill pill-green">
                  在线 Worker: {m.healthy_count} / {m.worker_count}
                </span>
                <span className="badge-pill pill-blue">
                  模型总并发: {m.active_conns || 0}
                </span>
              </div>
            </div>

            <div className="workers-table-wrapper">
              <table className="workers-table">
                <thead>
                  <tr>
                    <th>Worker 目标端点</th>
                    <th>并发负载 (In-Flight Conns)</th>
                    <th>断路器状态 (Circuit Breaker)</th>
                    <th>连续失败 (Fails)</th>
                    <th>健康嗅探 (Last Probe)</th>
                    <th style={{ textAlign: 'right' }}>运维快捷操作</th>
                  </tr>
                </thead>
                <tbody>
                  {!m.workers || m.workers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '24px' }}
                      >
                        该模型池暂无就绪的后端 Worker 节点
                      </td>
                    </tr>
                  ) : (
                    m.workers.map((w) => {
                      const isClosed = w.circuit_state === 'CLOSED' || w.healthy;
                      const pillClass = isClosed
                        ? 'pill-green'
                        : w.circuit_state === 'HALF_OPEN'
                        ? 'pill-amber'
                        : 'pill-red';
                      const stateText = w.circuit_state || (w.healthy ? 'CLOSED' : 'OPEN');

                      const conn = w.active_conns || 0;
                      const pct = Math.min(100, Math.max(0, (conn / 20) * 100));
                      const fillClass = pct > 70 ? 'high' : pct > 30 ? 'med' : '';

                      return (
                        <tr key={w.url}>
                          <td>
                            <div className="worker-endpoint">
                              <span>{w.url}</span>
                              <button
                                className="btn-copy"
                                onClick={() => onCopy(w.url)}
                                title="复制完整后端 URL"
                              >
                                复制
                              </button>
                            </div>
                            {w.last_error && (
                              <div
                                style={{
                                  fontSize: '11px',
                                  color: 'var(--apple-red)',
                                  marginTop: '3px',
                                  fontFamily: 'var(--font-mono)',
                                }}
                              >
                                异常: {w.last_error}
                              </div>
                            )}
                          </td>
                          <td>
                            <div className="load-bar-wrap">
                              <div className="load-bar">
                                <div
                                  className={`load-bar-fill ${fillClass}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="load-text">{conn}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`badge-pill ${pillClass}`}>
                              {stateText === 'CLOSED'
                                ? '🟢 CLOSED (正常)'
                                : stateText === 'HALF_OPEN'
                                ? '🟡 HALF_OPEN (嗅探)'
                                : '🔴 OPEN (熔断隔离)'}
                            </span>
                          </td>
                          <td>
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 700,
                                color:
                                  w.consecutive_failures > 0
                                    ? 'var(--apple-amber)'
                                    : 'var(--text-muted)',
                              }}
                            >
                              {w.consecutive_failures || 0}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                              {w.last_probe || '自动巡检中'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              className="btn-micro"
                              onClick={() => onProbe(w.url)}
                              title="立即主动发起 HTTP /health 探针检查"
                              style={{ marginRight: '6px' }}
                            >
                              🩺 嗅探探针
                            </button>
                            <button
                              className="btn-micro btn-micro-amber"
                              onClick={() => onReset(w.url)}
                              title="强制重置熔断器状态为 CLOSED"
                            >
                              🔄 重置熔断
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
