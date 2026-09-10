import React, { useState, useEffect, useCallback } from 'react';
import Navbar from './components/Navbar';
import KpiGrid from './components/KpiGrid';
import TopologyFlow from './components/TopologyFlow';
import ModelsMatrix from './components/ModelsMatrix';
import PlaygroundModal from './components/PlaygroundModal';

export default function App() {
  const [data, setData] = useState(null);
  const [refreshMs, setRefreshMs] = useState(2000);
  const [isPlaygroundOpen, setIsPlaygroundOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchTopology = useCallback(async (manual = false) => {
    try {
      const resp = await fetch('/api/topology');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      setData(json);
      if (manual) showToast('✅ 拓扑与负载已实时同步');
    } catch (err) {
      console.error('Fetch topology error:', err);
      if (manual) showToast(`❌ 获取拓扑失败: ${err.message}`, true);
    }
  }, []);

  useEffect(() => {
    fetchTopology();
    if (refreshMs > 0) {
      const timer = setInterval(() => fetchTopology(), refreshMs);
      return () => clearInterval(timer);
    }
  }, [refreshMs, fetchTopology]);

  const handleProbe = async (url) => {
    try {
      const resp = await fetch('/api/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const res = await resp.json();
      if (res.success) {
        showToast(`🟢 节点嗅探成功: ${url}`);
      } else {
        showToast(`🔴 节点嗅探失败: ${res.message || '超时或异常'}`, true);
      }
      fetchTopology();
    } catch (err) {
      showToast(`❌ 请求失败: ${err.message}`, true);
    }
  };

  const handleReset = async (url) => {
    try {
      const resp = await fetch('/api/reset-breaker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      await resp.json();
      showToast(`🔄 已重置断路器为 CLOSED: ${url}`);
      fetchTopology();
    } catch (err) {
      showToast(`❌ 请求失败: ${err.message}`, true);
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      showToast(`📋 已复制端点: ${text}`);
    });
  };

  return (
    <div>
      <Navbar
        data={data}
        refreshMs={refreshMs}
        onRefreshChange={setRefreshMs}
        onManualRefresh={() => fetchTopology(true)}
        onOpenPlayground={() => setIsPlaygroundOpen(true)}
      />

      <main className="container">
        <KpiGrid data={data} />
        <TopologyFlow data={data} />
        <ModelsMatrix
          models={data?.models || []}
          onProbe={handleProbe}
          onReset={handleReset}
          onCopy={handleCopy}
        />
      </main>

      <PlaygroundModal
        isOpen={isPlaygroundOpen}
        onClose={() => setIsPlaygroundOpen(false)}
        models={data?.models || []}
        onSent={() => fetchTopology()}
      />

      {toast && (
        <div
          className="toast"
          style={{ borderColor: toast.isError ? 'var(--accent-red)' : 'var(--accent-green)' }}
        >
          {toast.message}
        </div>
      )}

      <footer className="footer">
        GPUStack vLLM High-Performance Router & Dynamic Load Balancer ·{' '}
        <a href="https://github.com/CodeFindc/gpu-vllm-router" target="_blank" rel="noreferrer">
          GitHub 官方仓库
        </a>{' '}
        · 遵循 Apache 2.0 开源协议
      </footer>
    </div>
  );
}
