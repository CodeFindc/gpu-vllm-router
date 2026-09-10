import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import HeaderBar from './components/HeaderBar';
import KpiGrid from './components/KpiGrid';
import TopologyFlow from './components/TopologyFlow';
import ModelsMatrix from './components/ModelsMatrix';
import ConfigRulesView from './components/ConfigRulesView';
import PlaygroundView from './components/PlaygroundView';
import MetricsView from './components/MetricsView';

export default function App() {
  const [data, setData] = useState(null);
  const [refreshMs, setRefreshMs] = useState(2000);
  const [activeTab, setActiveTab] = useState('topology');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
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
      const now = new Date();
      setLastUpdated(now.toLocaleTimeString());
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
        showToast(`🟢 节点探针检测成功: ${url}`);
      } else {
        showToast(`🔴 节点探针检测失败: ${res.message || '超时或异常'}`, true);
      }
      fetchTopology();
    } catch (err) {
      showToast(`❌ 探针请求异常: ${err.message}`, true);
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
      showToast(`🔄 已重置断路器为正常状态: ${url}`);
      fetchTopology();
    } catch (err) {
      showToast(`❌ 重置请求异常: ${err.message}`, true);
    }
  };

  const handleQuickSwitchMode = async (modelName, targetMode) => {
    try {
      const resp = await fetch('/api/models/rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_name: modelName,
          mode: targetMode,
        }),
      });
      const res = await resp.json();
      if (!resp.ok || !res.success) {
        throw new Error(res.message || '切换失败');
      }
      showToast(`🔄 模型 ${modelName} 模式已切换为 ${targetMode}`);
      fetchTopology();
    } catch (err) {
      showToast(`❌ 模式切换失败: ${err.message}`, true);
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      showToast(`📋 内容已复制到剪贴板`);
    });
  };

  // Filter models based on search query
  const filteredModels = (data?.models || []).filter((m) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    if (m.model_name.toLowerCase().includes(q)) return true;
    return (m.workers || []).some((w) => w.url.toLowerCase().includes(q));
  });

  return (
    <div className="app-container">
      {/* Left Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        data={data}
        refreshMs={refreshMs}
        onRefreshChange={setRefreshMs}
        onManualRefresh={() => fetchTopology(true)}
      />

      {/* Right Main Workspace */}
      <main className="main-workspace">
        <HeaderBar
          activeTab={activeTab}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          data={data}
          lastUpdated={lastUpdated}
        />

        <div className="content-scroll">
          {/* Always Show KPI Summary Grid */}
          <KpiGrid data={data} />

          {/* Tab 1: Topology Architecture */}
          {activeTab === 'topology' && (
            <>
              <TopologyFlow data={data} onCopy={handleCopy} />
              <ModelsMatrix
                models={filteredModels}
                onProbe={handleProbe}
                onReset={handleReset}
                onCopy={handleCopy}
                onSwitchMode={handleQuickSwitchMode}
              />
            </>
          )}

          {/* Tab 2: Worker Nodes Load Matrix */}
          {activeTab === 'workers' && (
            <ModelsMatrix
              models={filteredModels}
              onProbe={handleProbe}
              onReset={handleReset}
              onCopy={handleCopy}
              onSwitchMode={handleQuickSwitchMode}
            />
          )}

          {/* Tab 3: Rules and Mode Configuration */}
          {activeTab === 'rules' && (
            <ConfigRulesView
              onRefreshTopology={fetchTopology}
              showToast={showToast}
              onCopy={handleCopy}
            />
          )}

          {/* Tab 4: Interactive Inference Playground */}
          {activeTab === 'playground' && (
            <PlaygroundView
              models={data?.models || []}
              onSent={() => fetchTopology()}
            />
          )}

          {/* Tab 5: System Metrics & Raw JSON */}
          {activeTab === 'metrics' && (
            <MetricsView
              data={data}
              onCopy={handleCopy}
            />
          )}
        </div>
      </main>

      {/* Toast Notification */}
      {toast && (
        <div
          className="toast"
          style={{
            borderLeft: `4px solid ${toast.isError ? 'var(--apple-red)' : 'var(--apple-green)'}`,
          }}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
