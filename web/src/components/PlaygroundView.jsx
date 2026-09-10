import React, { useState, useEffect } from 'react';

export default function PlaygroundView({ models, onSent }) {
  const [model, setModel] = useState('');
  const [sessionID, setSessionID] = useState('demo-session-client-01');
  const [prompt, setPrompt] = useState(
    '你好！请简述 gpu-vllm-router 如何通过一致性哈希 (Consistent Hash) 与会话粘性保障 KV Cache 前缀缓存命中率？'
  );
  const [output, setOutput] = useState('点击左侧 “发送推理请求” 开始测试...');
  const [status, setStatus] = useState('');
  const [latency, setLatency] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!model && models && models.length > 0) {
      setModel(models[0].model_name);
    }
  }, [models, model]);

  async function handleSend() {
    if (!model) {
      alert('请选择目标模型！');
      return;
    }

    setLoading(true);
    setStatus('正在调度后端 Worker 执行推理...');
    setOutput('正在等待推理模型返回...');
    const startTime = performance.now();

    try {
      const resp = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': sessionID,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      const elapsed = Math.round(performance.now() - startTime);
      setLatency(elapsed);

      if (!resp.ok) {
        const errText = await resp.text();
        setStatus(`❌ 请求失败 (HTTP ${resp.status})`);
        setOutput(`HTTP ${resp.status} Error (${elapsed}ms):\n${errText}`);
      } else {
        const res = await resp.json();
        setStatus(`🟢 推理成功 (${elapsed}ms)`);
        const content =
          res.choices && res.choices[0] && res.choices[0].message
            ? res.choices[0].message.content
            : JSON.stringify(res, null, 2);
        setOutput(content);
      }
      if (onSent) onSent();
    } catch (err) {
      setStatus('❌ 网络通信异常');
      setOutput(`Request error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="glass-panel">
      <div className="panel-header">
        <div className="panel-title">
          <span>💬</span>
          <span>在线快速推理测试沙箱 (Interactive Inference Playground)</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {status && (
            <span
              className={`badge-pill ${
                status.startsWith('🟢')
                  ? 'pill-green'
                  : status.startsWith('❌')
                  ? 'pill-red'
                  : 'pill-blue'
              }`}
            >
              {status}
            </span>
          )}
        </div>
      </div>

      <div className="playground-grid">
        {/* Left: Input Form */}
        <div>
          <div className="play-form-group">
            <label className="play-label">目标模型 (Target Model):</label>
            <select
              className="play-select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {!models || models.length === 0 ? (
                <option value="">暂无可用模型</option>
              ) : (
                models.map((m) => (
                  <option key={m.model_name} value={m.model_name}>
                    {m.model_name} ({m.healthy_count}/{m.worker_count} 在线 Worker)
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="play-form-group">
            <label className="play-label">会话粘性标识 (X-Session-ID / 前缀缓存亲和):</label>
            <input
              type="text"
              className="play-input"
              value={sessionID}
              onChange={(e) => setSessionID(e.target.value)}
              placeholder="例如: session-user-123"
            />
          </div>

          <div className="play-form-group">
            <label className="play-label">提示词内容 (User Prompt):</label>
            <textarea
              className="play-textarea"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="输入测试提示词..."
            />
          </div>

          <button
            className="btn-send"
            onClick={handleSend}
            disabled={loading || !model}
          >
            <span>{loading ? '⏳' : '🚀'}</span>
            <span>{loading ? '正在处理中...' : '发送推理请求 (POST /v1/chat/completions)'}</span>
          </button>
        </div>

        {/* Right: Response Viewer */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span className="play-label">模型响应输出 (Response Body / Markdown / JSON):</span>
            {latency !== null && (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                耗时: {latency} ms
              </span>
            )}
          </div>
          <div className="response-box">
            {output}
          </div>
        </div>
      </div>
    </section>
  );
}
