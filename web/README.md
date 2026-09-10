# GPUStack vLLM Router - React Web Dashboard

这是 `gpu-vllm-router` 的现代化 React 可视化监控与运维控制台源码。

---

## 架构与技术栈

- **前端技术栈**：React 18 + Vite 5 + 现代化响应式 CSS
- **打包插件**：`vite-plugin-singlefile`（将全套 React SPA、样式与逻辑自动内联编译为自包含单文件，零 CDN 依赖，完全支持离线内网与隔离机房环境）
- **Go 二进制嵌入**：编译产物自动嵌入 Go 标准库 `pkg/dashboard/dist/index.html`，通过 `//go:embed` 直接内嵌至单个 Go 可执行程序中。

---

## 核心功能

1. **多模型路由架构拓扑流 (Architecture Flow)**：
   - 展现客户端请求（带 `X-Session-ID` 会话粘性头） $\to$ 调度前置网关（端口与负载策略） $\to$ 各模型路由池 $\to$ 后端推理 Worker 节点的完整数据流向。
2. **Worker 并发负载与断路器状态矩阵 (Load & Breakers)**：
   - 实时动态呈现每个 Worker 节点的活跃连接数进度条（In-Flight Conns）、熔断器健康状态（`CLOSED`/`OPEN`/`HALF_OPEN`）、连续失败次数及最后探测耗时。
3. **运维操作快捷入口 (Ops Actions)**：
   - 单节点手动健康嗅探（Probe）；
   - 一键重置断路器为 CLOSED 状态；
   - 复制后端 Worker 端点。
4. **内置在线推理调试台 (Inference Playground)**：
   - 可在控制台中直接向任意纳管模型发送 Chat Completion 请求，并实时观察对应 Worker 节点的并发连接与响应时延。

---

## 本地开发指南

### 1. 安装依赖
```bash
npm install
```

### 2. 启动本地开发服务 (带反向代理)
```bash
npm run dev
```
开发服务器将运行在 `http://localhost:5173`，默认将 `/api` 与 `/v1` 代理至后台 `http://localhost:8000`。

### 3. 构建生产单文件包并同步到 Go 模块
```bash
npm run build
cp dist/index.html ../pkg/dashboard/dist/index.html
```
