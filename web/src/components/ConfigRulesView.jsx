import React, { useState, useEffect, useRef } from 'react';

const POLICY_OPTIONS = [
  { value: 'consistent_hash', label: '一致性哈希 (consistent_hash) - 会话保持，高 Cache 命中率' },
  { value: 'round_robin', label: '轮询分发 (round_robin) - 请求均匀分散' },
  { value: 'power_of_two', label: '最小负载选择 (power_of_two) - P2C 双候选低延迟感知' },
  { value: 'random', label: '随机分发 (random) - 无状态快速打散' },
];

export default function ConfigRulesView({ clusterModels = [], onRefreshTopology, showToast, onCopy }) {
  const [config, setConfig] = useState(null);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Form State
  const [globalMode, setGlobalMode] = useState('proxy');
  const [globalPolicy, setGlobalPolicy] = useState('consistent_hash');
  const [watchInterval, setWatchInterval] = useState(10);
  const [zeroDowntime, setZeroDowntime] = useState(true);
  const [drainTimeout, setDrainTimeout] = useState(60);

  // Circuit Breaker State
  const [cbEnabled, setCbEnabled] = useState(true);
  const [cbMaxFailures, setCbMaxFailures] = useState(3);
  const [cbCooldown, setCbCooldown] = useState(10);
  const [cbMaxRetries, setCbMaxRetries] = useState(2);
  const [cbHealthCheckInterval, setCbHealthCheckInterval] = useState(3);
  const [cbSuccessThreshold, setCbSuccessThreshold] = useState(2);

  // Per-Model Rules: map of modelName -> { mode: '', policy: '' }
  const [modelRules, setModelRules] = useState({});

  // Use ref to keep track of hasChanges without triggering effect dependencies
  const hasChangesRef = useRef(false);
  hasChangesRef.current = hasChanges;

  const loadConfig = async (isManual = false) => {
    try {
      if (isManual || !config) setLoading(true);
      setLoadError(null);
      const resp = await fetch('/api/config');
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
      }
      const data = await resp.json();
      setConfig(data);

      // Only update form fields if user does not have uncommitted changes
      if (!hasChangesRef.current || isManual) {
        setGlobalMode(data.mode || 'proxy');
        setGlobalPolicy(data.policy || 'consistent_hash');
        setWatchInterval(data.watch_interval_secs || 10);
        setZeroDowntime(data.zero_downtime !== false);
        setDrainTimeout(data.drain_timeout_secs || 60);

        setCbEnabled(data.circuit_breaker_enabled !== false);
        setCbMaxFailures(data.max_failures || 3);
        setCbCooldown(data.cooldown_secs || 10);
        setCbMaxRetries(data.max_retries !== undefined ? data.max_retries : 2);
        setCbHealthCheckInterval(data.health_check_interval_secs || 3);
        setCbSuccessThreshold(data.success_threshold || 2);

        const rulesMap = {};
        (data.models || []).forEach((m) => {
          rulesMap[m.model_name] = {
            mode: m.mode || '',
            policy: m.policy || '',
          };
        });

        // Merge any models discovered in cluster topology
        if (clusterModels && clusterModels.length > 0) {
          clusterModels.forEach((cm) => {
            if (!rulesMap[cm.model_name]) {
              rulesMap[cm.model_name] = {
                mode: cm.mode || '',
                policy: cm.policy || '',
              };
            }
          });
        }

        setModelRules(rulesMap);
        setModels(data.models || []);
        setHasChanges(false);
      }

      if (isManual && showToast) {
        showToast('✅ 配置已重新读取并载入');
      }
    } catch (err) {
      console.error('Failed to load config:', err);
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Mount effect: execute once on mount!
  useEffect(() => {
    loadConfig(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleModelRuleChange = (modelName, field, value) => {
    setModelRules((prev) => ({
      ...prev,
      [modelName]: {
        ...(prev[modelName] || { mode: '', policy: '' }),
        [field]: value,
      },
    }));
    setHasChanges(true);
  };

  const handleSaveSingleModel = async (modelName) => {
    const rule = modelRules[modelName] || { mode: '', policy: '' };
    try {
      const resp = await fetch('/api/models/rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_name: modelName,
          mode: rule.mode,
          policy: rule.policy,
        }),
      });
      const res = await resp.json();
      if (!resp.ok || !res.success) {
        throw new Error(res.message || '更新失败');
      }
      if (showToast) showToast(`✅ 模型 ${modelName} 规则已更新并热生效`);
      if (onRefreshTopology) onRefreshTopology();
    } catch (err) {
      if (showToast) showToast(`❌ 更新模型规则失败: ${err.message}`, true);
    }
  };

  const handleSaveAll = async () => {
    try {
      setSaving(true);
      const modelsPayload = Object.keys(modelRules).map((name) => ({
        model_name: name,
        mode: modelRules[name].mode,
        policy: modelRules[name].policy,
      }));

      const payload = {
        mode: globalMode,
        policy: globalPolicy,
        watch_interval_secs: parseInt(watchInterval, 10),
        zero_downtime: zeroDowntime,
        drain_timeout_secs: parseInt(drainTimeout, 10),
        circuit_breaker_enabled: cbEnabled,
        max_failures: parseInt(cbMaxFailures, 10),
        cooldown_secs: parseInt(cbCooldown, 10),
        max_retries: parseInt(cbMaxRetries, 10),
        health_check_interval_secs: parseInt(cbHealthCheckInterval, 10),
        success_threshold: parseInt(cbSuccessThreshold, 10),
        models: modelsPayload,
      };

      const resp = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const res = await resp.json();
      if (!resp.ok || !res.success) {
        throw new Error(res.message || '保存失败');
      }

      if (showToast) showToast(`✅ 配置已成功保存并实时热生效`);
      setHasChanges(false);
      if (onRefreshTopology) onRefreshTopology();
    } catch (err) {
      console.error('Failed to save config:', err);
      if (showToast) showToast(`❌ 保存配置失败: ${err.message}`, true);
    } finally {
      setSaving(false);
    }
  };

  const generateYamlPreview = () => {
    const lines = [
      '# 实时生成的 gpu-vllm-router 配置文件 (config.yaml)',
      'router:',
      `  mode: "${globalMode}"`,
      `  host: "0.0.0.0"`,
      `  port: 8000`,
      `  watch_interval: "${watchInterval}s"`,
      `  zero_downtime: ${zeroDowntime}`,
      `  drain_timeout: "${drainTimeout}s"`,
      '',
      'target:',
      `  policy: "${globalPolicy}"`,
      '',
      'circuit_breaker:',
      `  enabled: ${cbEnabled}`,
      `  max_failures: ${cbMaxFailures}`,
      `  cooldown: "${cbCooldown}s"`,
      `  max_retries: ${cbMaxRetries}`,
      `  health_check_interval: "${cbHealthCheckInterval}s"`,
      `  success_threshold: ${cbSuccessThreshold}`,
      '',
      'models:',
    ];

    const modelKeys = Object.keys(modelRules);
    if (modelKeys.length === 0) {
      lines.push('  # 暂无单独模型规则覆盖 (默认全部继承全局配置)');
    } else {
      modelKeys.forEach((m) => {
        const r = modelRules[m];
        lines.push(`  - model_name: "${m}"`);
        if (r.mode) lines.push(`    mode: "${r.mode}"`);
        if (r.policy) lines.push(`    policy: "${r.policy}"`);
      });
    }

    return lines.join('\n');
  };

  // Combine model names from config, cluster topology, and user-edited modelRules
  const allModelNames = Array.from(new Set([
    ...models.map((m) => m.model_name),
    ...clusterModels.map((cm) => cm.model_name),
    ...Object.keys(modelRules),
  ])).filter(Boolean);

  // Initial loading view (only when no config has ever loaded)
  if (loading && !config && !loadError) {
    return (
      <section className="glass-panel">
        <div style={{ textAlign: 'center', padding: '64px', color: 'var(--text-muted)' }}>
          <span style={{ fontSize: '28px', display: 'block', marginBottom: '12px' }}>⏳</span>
          正在初次读取系统动态配置与模型规则...
        </div>
      </section>
    );
  }

  // Load error view with friendly in-place retry button
  if (loadError && !config) {
    return (
      <section className="glass-panel" style={{ padding: '36px 24px' }}>
        <div style={{ textAlign: 'center', maxWidth: '520px', margin: '0 auto' }}>
          <span style={{ fontSize: '36px', display: 'block', marginBottom: '14px' }}>⚠️</span>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--apple-red)', marginBottom: '8px' }}>
            无法载入系统动态配置 (/api/config)
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.5 }}>
            路由器服务暂时未响应或返回错误: {loadError}。请检查路由器进程是否运行。
          </p>
          <button
            className="btn-send"
            style={{ margin: '0 auto', padding: '8px 24px' }}
            onClick={() => loadConfig(true)}
          >
            🔄 重新尝试读取
          </button>
        </div>
      </section>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Action Bar */}
      <section className="glass-panel" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>⚙️</span>
              <span>路由规则与运行模式管理</span>
              {hasChanges && (
                <span className="badge-pill pill-amber" style={{ fontSize: '11px' }}>
                  ● 未保存修改
                </span>
              )}
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
              支持在线调整各模型运行模式 (proxy / run)、分发策略、熔断高可用参数，并热生效同步至配置文件
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              className="action-btn"
              onClick={() => loadConfig(true)}
              disabled={saving}
              title="放弃修改并重新载入服务器配置"
            >
              🔄 重置还原
            </button>
            <button
              className="action-btn"
              onClick={() => onCopy && onCopy(generateYamlPreview())}
              title="复制当前设置对应的 YAML 格式文本"
            >
              📋 复制 YAML
            </button>
            <button
              className="btn-send"
              style={{ padding: '8px 20px' }}
              onClick={handleSaveAll}
              disabled={saving}
            >
              {saving ? '💾 正在应用...' : '💾 保存修改并热生效'}
            </button>
          </div>
        </div>
      </section>

      {/* Grid: Global Mode & Policy Card */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
        {/* Card 1: Global Routing Mode & Algorithm */}
        <section className="glass-panel">
          <div className="panel-header">
            <div className="panel-title">
              <span>🌐</span>
              <span>全局默认运行模式与负载均衡策略</span>
            </div>
            <span className="badge-pill pill-blue">基准配置</span>
          </div>

          <div style={{ padding: '8px 4px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Global Mode Segmented Picker */}
            <div className="play-form-group">
              <label className="play-label">全局默认运行模式 (Global Mode)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '4px' }}>
                <div
                  onClick={() => { setGlobalMode('proxy'); setHasChanges(true); }}
                  style={{
                    padding: '14px',
                    borderRadius: '12px',
                    border: globalMode === 'proxy' ? '2px solid var(--apple-blue)' : '1px solid var(--glass-border-subtle)',
                    background: globalMode === 'proxy' ? 'var(--apple-blue-bg)' : 'rgba(255, 255, 255, 0.6)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>⚡ Go 原生代理 (proxy)</span>
                    {globalMode === 'proxy' && <span style={{ color: 'var(--apple-blue)', fontWeight: 800 }}>✓</span>}
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    极速无额外进程开销，流式 SSE 零拷贝转发，内置智能熔断与多副本故障透明重试。
                  </p>
                </div>

                <div
                  onClick={() => { setGlobalMode('run'); setHasChanges(true); }}
                  style={{
                    padding: '14px',
                    borderRadius: '12px',
                    border: globalMode === 'run' ? '2px solid var(--apple-purple)' : '1px solid var(--glass-border-subtle)',
                    background: globalMode === 'run' ? 'var(--apple-purple-bg)' : 'rgba(255, 255, 255, 0.6)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>🛡️ 官方守护 (run)</span>
                    {globalMode === 'run' && <span style={{ color: 'var(--apple-purple)', fontWeight: 800 }}>✓</span>}
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    自动为每个模型拉起独立的官方 vllm-router 进程，蓝绿双轨零停机滚动更新。
                  </p>
                </div>
              </div>
            </div>

            {/* Global Policy */}
            <div className="play-form-group">
              <label className="play-label">全局默认负载均衡算法 (Default Policy)</label>
              <select
                className="play-select"
                value={globalPolicy}
                onChange={(e) => { setGlobalPolicy(e.target.value); setHasChanges(true); }}
              >
                {POLICY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Watch Interval */}
            <div className="play-form-group">
              <label className="play-label">服务发现同步轮询周期 (Watch Interval, 秒)</label>
              <input
                type="number"
                min="1"
                max="300"
                className="play-input"
                value={watchInterval}
                onChange={(e) => { setWatchInterval(e.target.value); setHasChanges(true); }}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                动态监测 GPUStack 集群模型副本扩缩容与节点上下线的时间间隔
              </span>
            </div>
          </div>
        </section>

        {/* Card 2: Circuit Breaker & Failover Settings */}
        <section className="glass-panel">
          <div className="panel-header">
            <div className="panel-title">
              <span>🛡️</span>
              <span>断路器与高可用容灾参数</span>
            </div>
            <span className={`badge-pill ${cbEnabled ? 'pill-green' : 'pill-red'}`}>
              {cbEnabled ? '断路器已启用' : '已停用'}
            </span>
          </div>

          <div style={{ padding: '8px 4px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--glass-border-subtle)' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>启用后端健康断路器 (Circuit Breaker)</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>连续故障时自动隔离病态工作节点，防止流量雪崩</div>
              </div>
              <input
                type="checkbox"
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                checked={cbEnabled}
                onChange={(e) => { setCbEnabled(e.target.checked); setHasChanges(true); }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="play-form-group">
                <label className="play-label">熔断连续失败阈值 (Max Failures)</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  className="play-input"
                  value={cbMaxFailures}
                  onChange={(e) => { setCbMaxFailures(e.target.value); setHasChanges(true); }}
                />
              </div>

              <div className="play-form-group">
                <label className="play-label">熔断隔离冷却时长 (Cooldown, 秒)</label>
                <input
                  type="number"
                  min="1"
                  max="600"
                  className="play-input"
                  value={cbCooldown}
                  onChange={(e) => { setCbCooldown(e.target.value); setHasChanges(true); }}
                />
              </div>

              <div className="play-form-group">
                <label className="play-label">故障透明重试次数 (Max Retries)</label>
                <input
                  type="number"
                  min="0"
                  max="5"
                  className="play-input"
                  value={cbMaxRetries}
                  onChange={(e) => { setCbMaxRetries(e.target.value); setHasChanges(true); }}
                />
              </div>

              <div className="play-form-group">
                <label className="play-label">主动健康探测间隔 (Probe Interval, 秒)</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  className="play-input"
                  value={cbHealthCheckInterval}
                  onChange={(e) => { setCbHealthCheckInterval(e.target.value); setHasChanges(true); }}
                />
              </div>
            </div>

            {/* Zero Downtime & Drain */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--glass-border-subtle)' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>零停机滚动更新 (Zero-Downtime Reload)</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>蓝绿双轨热切，确保节点变更时不中断正在生成的会话</div>
              </div>
              <input
                type="checkbox"
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                checked={zeroDowntime}
                onChange={(e) => { setZeroDowntime(e.target.checked); setHasChanges(true); }}
              />
            </div>
          </div>
        </section>
      </div>

      {/* Per-Model Mode & Policy Rule Matrix */}
      <section className="glass-panel">
        <div className="panel-header">
          <div className="panel-title">
            <span>🧠</span>
            <span>多模型独立运行模式与策略规则矩阵 (Per-Model Rules Matrix)</span>
          </div>
          <span className="badge-pill pill-purple">共纳管 {allModelNames.length} 个模型池</span>
        </div>

        <div className="workers-table-wrapper" style={{ marginTop: '12px' }}>
          <table className="workers-table">
            <thead>
              <tr>
                <th style={{ width: '25%' }}>模型名称</th>
                <th style={{ width: '25%' }}>运行模式配置 (Mode)</th>
                <th style={{ width: '25%' }}>分发策略配置 (Policy)</th>
                <th style={{ width: '15%' }}>当前生效状态</th>
                <th style={{ width: '10%', textAlign: 'right' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {allModelNames.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '32px' }}>
                    未在集群中发现活动模型
                  </td>
                </tr>
              ) : (
                allModelNames.map((modelName) => {
                  const rule = modelRules[modelName] || { mode: '', policy: '' };
                  const effectiveMode = rule.mode || globalMode;
                  const effectivePolicy = rule.policy || globalPolicy;

                  return (
                    <tr key={modelName}>
                      <td style={{ fontWeight: 600 }}>
                        <span>🧠 {modelName}</span>
                      </td>

                      <td>
                        <select
                          className="play-select"
                          style={{ padding: '6px 10px', fontSize: '12px' }}
                          value={rule.mode}
                          onChange={(e) => handleModelRuleChange(modelName, 'mode', e.target.value)}
                        >
                          <option value="">⚙️ 继承全局 ({globalMode === 'run' ? 'run 官方' : 'proxy 代理'})</option>
                          <option value="proxy">⚡ Go 原生代理 (proxy)</option>
                          <option value="run">🛡️ 官方守护进程 (run)</option>
                        </select>
                      </td>

                      <td>
                        <select
                          className="play-select"
                          style={{ padding: '6px 10px', fontSize: '12px' }}
                          value={rule.policy}
                          onChange={(e) => handleModelRuleChange(modelName, 'policy', e.target.value)}
                        >
                          <option value="">⚙️ 继承全局 ({globalPolicy})</option>
                          <option value="consistent_hash">一致性哈希 (consistent_hash)</option>
                          <option value="round_robin">轮询分发 (round_robin)</option>
                          <option value="power_of_two">最小负载选择 (power_of_two)</option>
                          <option value="random">随机分发 (random)</option>
                        </select>
                      </td>

                      <td>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <span
                            className={`badge-pill ${effectiveMode === 'run' ? 'pill-purple' : 'pill-blue'}`}
                            style={{ fontSize: '11px' }}
                          >
                            {effectiveMode === 'run' ? '🛡️ run' : '⚡ proxy'}
                          </span>
                          <span className="badge-pill pill-blue" style={{ fontSize: '11px' }}>
                            {effectivePolicy}
                          </span>
                        </div>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="action-btn"
                          style={{ fontSize: '11px', padding: '4px 8px' }}
                          onClick={() => handleSaveSingleModel(modelName)}
                          title="立即单独应用此模型的规则变更"
                        >
                          单独应用
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Live YAML Preview Card */}
      <section className="glass-panel">
        <div className="panel-header">
          <div className="panel-title">
            <span>📋</span>
            <span>配置持久化 YAML 预览 (config.yaml)</span>
          </div>
          <button
            className="action-btn"
            style={{ fontSize: '12px' }}
            onClick={() => onCopy && onCopy(generateYamlPreview())}
          >
            📋 复制配置文本
          </button>
        </div>

        <div style={{ marginTop: '12px' }}>
          <pre
            style={{
              background: 'rgba(248, 250, 252, 0.95)',
              border: '1px solid #cbd5e1',
              borderRadius: '12px',
              padding: '16px',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: 'var(--text-primary)',
              lineHeight: 1.6,
              overflowX: 'auto',
            }}
          >
            {generateYamlPreview()}
          </pre>
        </div>
      </section>
    </div>
  );
}
