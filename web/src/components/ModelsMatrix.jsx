import React from 'react';

export default function ModelsMatrix({ models, onProbe, onReset, onCopy }) {
  if (!models || models.length === 0) {
    return (
      <section className="section-card">
        <div className="section-header">
          <span className="section-title">📊 各模型推理集群与 Worker 节点负载明细 (Model Pools & Workers Load)</span>
        </div>
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
          当前 GPUStack 集群中暂无处于运行中 (running) 的模型实例
        </div>
      </section>
    );
  }

  return (
    <section className="section-card">
      <div className="section-header">
        <span className="section-title">📊 各模型推理集群与 Worker 节点负载明细 (Model Pools & Workers Load)</span>
      </div>
      <div className="models-list">
        {models.map((m) => (
          <div key={m.model_name} className="model-box">
            <div className="model-header">
              <div className="model-name">
                <span>🧠 {m.model_name}</span>
                <span className="badge badge-blue">策略: {m.policy}</span>
              </div>
              <div className="model-stats-badges">
                <span className="badge badge-green">在线 Worker: {m.healthy_count} / {m.worker_count}</span>
                <span className="badge badge-blue">当前并发连接: {m.active_conns || 0}</span>
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
                    <th>最后探测 (Last Probe)</th>
                    <th style={{ textAlign: 'right' }}>快捷运维操作</th>
                  </tr>
                </thead>
                <tbody>
                  {!m.workers || m.workers.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '20px' }}>
                        该模型暂无注册的 Worker 节点
                      </td>
                    </tr>
                  ) : (
                    m.workers.map((w) => {
                      const isClosed = w.circuit_state === 'CLOSED' || w.healthy;
                      const stateClass = isClosed ? 'badge-green' : (w.circuit_state === 'HALF_OPEN' ? 'badge-amber' : 'badge-red');
                      const stateText = w.circuit_state || (w.healthy ? 'CLOSED' : 'OPEN');

                      const conn = w.active_conns || 0;
                      const pct = Math.min(100, Math.max(0, (conn / 20) * 100));
                      const fillClass = pct > 70 ? 'high' : (pct > 30 ? 'med' : '');

                      return (
                        <tr key={w.url}>
                          <td>
                            <div className="worker-endpoint">
                              <span>{w.url}</span>
                              <button className="btn-copy" onClick={() => onCopy(w.url)}>复制</button>
                            </div>
                            {w.last_error && (
                              <div style={{ fontSize: '11px', color: 'var(--accent-red)', marginTop: '2px' }}>
                                异常: {w.last_error}
                              </div>
                            )}
                          </td>
                          <td>
                            <div className="load-bar-wrap">
                              <div className="load-bar">
                                <div className={`load-bar-fill ${fillClass}`} style={{ width: `${pct}%` }}></div>
                              </div>
                              <span className="load-text">{conn}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${stateClass}`}>
                              {stateText === 'CLOSED' ? '🟢 正常 (CLOSED)' : (stateText === 'HALF_OPEN' ? '🟡 嗅探 (HALF_OPEN)' : '🔴 熔断隔离 (OPEN)')}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: w.consecutive_failures > 0 ? 'var(--accent-amber)' : 'var(--text-muted)' }}>
                              {w.consecutive_failures || 0}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                              {w.last_probe || '后台嗅探中'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              className="btn-action"
                              style={{ padding: '4px 8px', fontSize: '11px', marginRight: '4px' }}
                              onClick={() => onProbe(w.url)}
                            >
                              🩺 嗅探测试
                            </button>
                            <button
                              className="btn-action"
                              style={{ padding: '4px 8px', fontSize: '11px', background: 'rgba(245, 158, 11, 0.12)', color: 'var(--accent-amber)', borderColor: 'rgba(245, 158, 11, 0.3)' }}
                              onClick={() => onReset(w.url)}
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
