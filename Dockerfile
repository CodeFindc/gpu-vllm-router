# ==============================================================================
# 阶段 1: 编译官方最新 vllm-project/router Rust 二进制 (配置国内镜像源)
# ==============================================================================
ARG REGISTRY_MIRROR=""
FROM ${REGISTRY_MIRROR}rustlang/rust:nightly-bookworm AS vllm-router-builder

# 配置 Debian 国内阿里云镜像源并开启 [trusted=yes] 避免 GPG NO_PUBKEY 报错
RUN rm -f /etc/apt/sources.list.d/debian.sources && \
    echo "deb [trusted=yes] http://mirrors.aliyun.com/debian/ bookworm main non-free non-free-firmware contrib" > /etc/apt/sources.list && \
    echo "deb [trusted=yes] http://mirrors.aliyun.com/debian/ bookworm-updates main non-free non-free-firmware contrib" >> /etc/apt/sources.list && \
    echo "deb [trusted=yes] http://mirrors.aliyun.com/debian-security/ bookworm-security main non-free non-free-firmware contrib" >> /etc/apt/sources.list && \
    apt-get update && apt-get install -y --no-install-recommends \
    git \
    build-essential \
    pkg-config \
    libssl-dev \
    protobuf-compiler \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 配置 Rust / Cargo 国内稀疏索引加速 (rsproxy.cn)
ENV RUSTUP_DIST_SERVER=https://rsproxy.cn
ENV RUSTUP_UPDATE_ROOT=https://rsproxy.cn/rustup
RUN mkdir -p /root/.cargo && \
    echo '[source.crates-io]' > /root/.cargo/config.toml && \
    echo 'replace-with = "rsproxy-sparse"' >> /root/.cargo/config.toml && \
    echo '[source.rsproxy-sparse]' >> /root/.cargo/config.toml && \
    echo 'registry = "sparse+https://rsproxy.cn/index/"' >> /root/.cargo/config.toml && \
    echo '[net]' >> /root/.cargo/config.toml && \
    echo 'git-fetch-with-cli = true' >> /root/.cargo/config.toml

# 拉取最新官方 vllm-project/router 源码并编译 release 二进制 (支持 GitHub 镜像代理)
ARG GH_PROXY="https://ghfast.top/"
WORKDIR /src
RUN git clone --depth 1 ${GH_PROXY}https://github.com/vllm-project/router.git /src/router
WORKDIR /src/router
RUN cargo build --release

# ==============================================================================
# 阶段 2: 编译 gpu-vllm-router (Go 服务，配置 goproxy.cn)
# ==============================================================================
FROM ${REGISTRY_MIRROR}golang:1.22-bookworm AS go-builder

ARG GOPROXY="https://goproxy.cn,direct"
ENV GOPROXY=${GOPROXY}
ENV GO111MODULE=on

WORKDIR /src/gpu-vllm-router
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /src/gpu-vllm-router/bin/gpu-vllm-router ./cmd/gpu-vllm-router

# ==============================================================================
# 阶段 3: 最小化轻量生产运行镜像
# ==============================================================================
FROM ${REGISTRY_MIRROR}debian:bookworm-slim

# 配置运行时 Debian 阿里云镜像源
RUN rm -f /etc/apt/sources.list.d/debian.sources && \
    echo "deb [trusted=yes] http://mirrors.aliyun.com/debian/ bookworm main non-free non-free-firmware contrib" > /etc/apt/sources.list && \
    echo "deb [trusted=yes] http://mirrors.aliyun.com/debian/ bookworm-updates main non-free non-free-firmware contrib" >> /etc/apt/sources.list && \
    echo "deb [trusted=yes] http://mirrors.aliyun.com/debian-security/ bookworm-security main non-free non-free-firmware contrib" >> /etc/apt/sources.list && \
    apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    libssl3 \
    procps \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# 设置时区
ENV TZ=Asia/Shanghai

WORKDIR /app

# 从构建阶段复制二进制可执行文件
COPY --from=vllm-router-builder /src/router/target/release/vllm-router /usr/local/bin/vllm-router
COPY --from=go-builder /src/gpu-vllm-router/bin/gpu-vllm-router /usr/local/bin/gpu-vllm-router

RUN chmod +x /usr/local/bin/vllm-router /usr/local/bin/gpu-vllm-router

# 拷贝示例配置作为容器内默认备用配置
COPY config.example.yaml /app/config.yaml

# 暴露对外统一服务端口
EXPOSE 8000

# 容器健康检查
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

ENTRYPOINT ["/usr/local/bin/gpu-vllm-router"]
CMD ["-config", "/app/config.yaml"]
