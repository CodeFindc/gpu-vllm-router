import React, { useState } from 'react';

export default function PlaygroundModal({ isOpen, onClose, models, onSent }) {
  const [model, setModel] = useState('');
  const [sessionID, setSessionID] = useState('dashboard_session_demo');
  const [prompt, setPrompt] = useState('你好！请简要介绍一下 GPUStack 与 vLLM-Router 如何协同进行大模型负载均衡。');
  const [output, setOutput] = useState('等待发送请求...');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  // Set default model when available
  React.useEffect(() => {
    if (!model && models && models.length > 0) {
      setModel(models[0].model_name);
    }
  }, [models, model]);

  if (!isOpen) return null;

  async function handleSend() {
    if (!model) {
      alert('请选择目标模型！');
      return;
    }

    setLoading(true);
    setStatus('正在发送推理请求...');
    setOutput('正在等待模型返回 (流式传输或完整返回)...');
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
      if (!resp.ok) {
        const errText = await resp.text();
        setStatus(`❌ 请求失败 (HTTP ${resp.status})`);
        setOutput(`Error (${elapsed}ms):\n${errText}`);
      } else {
        const res = await resp.json();
        setStatus(`✅ 成功 (${elapsed}ms)`);
        const content =
          res.choices && res.choices[0] && res.choices[0].message
            ? res.choices[0].message.content
            : JSON.stringify(res, null, 2);
        setOutput(content);
      }
      if (onSent) onSent();
    } catch (err) {
      setStatus('❌ 网络异常');
      setOutput(`Request error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <span className="modal-title">💬 在线快速推理测试 (Inference Playground)</span>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">目标模型 (Model):</label>
            <select
              className="form-select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {models.map((m) => (
                <option key={m.model_name} value={m.model_name}>
                  {m.model_name} ({m.worker_count} workers)
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">会话标识 (X-Session-ID / 保持前缀缓存粘性):</label>
            <input
              type="text"
              className="form-input"
              value={sessionID}
              onChange={(e) => setSessionID(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">用户消息 (Prompt):</label>
            <textarea
              className="form-textarea"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              className="btn-action"
              style={{ padding: '8px 16px' }}
              onClick={handleSend}
              disabled={loading}
            >
              🚀 {loading ? '正在推理...' : '发送请求 (/v1/chat/completions)'}
            </button>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{status}</span>
          </div>

          <div className="form-group">
            <label className="form-label">推理响应输出 (Response):</label>
            <div className="response-area">{output}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
