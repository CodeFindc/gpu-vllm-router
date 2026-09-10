import React from 'react';

const POLICY_NAMES = {
  consistent_hash: '一致性哈希',
  cache_aware: '前缀缓存感知 (Cache Aware)',
  rendezvous_hash: '最高随机权重 (HRW)',
  round_robin: '轮询分发',
  power_of_two: '最小负载 (P2C)',
  random: '随机分发',
};

export default function ModelsMatrix({ models, onProbe, onReset, onCopy, onSwitchMode }) {
  if (!models || models.length === 0) {
    return (
      <section className="glass-panel">
        <div className="panel-header">
          <div className="panel-title">
            <span>📊</span>
            <span>模型集群与工作节点负载明细</span>
          </div>
        </div>
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-dim)' }}>
          暂无匹配的模型实例或工作节点
        </div>
      </section>
    );
  }

  return (
    <section className="glass-panel">
      <div className="panel-header">
        <div className="panel-title">
          <span>📊</span>
          <span>模型集群与工作节点负载明细</span>
        </div>
        <span className="badge-pill pill-blue">已纳管 {models.length} 个模型池</span>
      </div>

      <div className="models-container">
        {models.map((m) => {
          const policyLabel = POLICY_NAMES[m.policy] || m.policy;
          const isRunMode = m.mode === 'run';

          return (
            <div key={m.model_name} className="model-box">
              <div className="model-header">
                <div className="model-name" style={{ flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontSize: '15px' }}>🧠 {m.model_name}</span>
                  <span
                    className={`badge-pill ${isRunMode ? 'pill-purple' : 'pill-blue'}`}
                    style={{ fontSize: '11px', fontWeight: 600 }}
                  >
                    {isRunMode ? '🛡️ 官方守护 (run)' : '⚡ Go 原生代理 (proxy)'}
                  </span>
                  <span className="badge-pill pill-blue" style={{ fontSize: '11px' }}>
                    策略: {policyLabel}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {onSwitchMode && (
                    <button
                      className="action-btn"
                      style={{ fontSize: '11px', padding: '3px 8px' }}
                      onClick={() => onSwitchMode(m.model_name, isRunMode ? 'proxy' : 'run')}
                      title={`快速将模型切换为 ${isRunMode ? 'proxy (Go 原生代理)' : 'run (官方守护进程)'} 模式`}
                    >
                      🔄 快速切换至 {isRunMode ? 'proxy' : 'run'}
                    </button>
                  )}
                  <span className="badge-pill pill-green">
                    就绪节点: {m.healthy_count} / {m.worker_count}
                  </span>
                  <span className="badge-pill pill-blue">
                    模型总并发: {m.active_conns || 0} 请求
                  </span>
                </div>
              </div>

              <div className="workers-table-wrapper">
                <table className="workers-table">
                  <thead>
                    <tr>
                      <th>工作节点端点</th>
                      <th>当前并发负载</th>
                      <th>熔断器状态</th>
                      <th>连续失败次数</th>
                      <th>最近健康探测</th>
                      <th style={{ textAlign: 'right' }}>快捷运维操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!m.workers || m.workers.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '24px' }}
                        >
                          该模型池暂无就绪的工作节点
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
                        const stateText = isClosed
                          ? '🟢 正常'
                          : w.circuit_state === 'HALF_OPEN'
                          ? '🟡 探测恢复中'
                          : '🔴 熔断隔离';

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
                                  title="复制端点 URL"
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
                                  异常详情: {w.last_error}
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
                                <span className="load-text">{conn} 请求</span>
                              </div>
                            </td>
                            <td>
                              <span className={`badge-pill ${pillClass}`}>
                                {stateText}
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
                                {w.last_probe || '自动探测中'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                className="btn-micro"
                                onClick={() => onProbe(w.url)}
                                title="主动向该工作节点发起健康探测"
                                style={{ marginRight: '6px' }}
                              >
                                🩺 探针检测
                              </button>
                              <button
                                className="btn-micro btn-micro-amber"
                                onClick={() => onReset(w.url)}
                                title="强制重置熔断器状态为正常 (CLOSED)"
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
          );
        })}
      </div>
    </section>
  );
}
