# Arthas Manager

一款基于 Node.js + TypeScript 的命令行工具，用于通过 SSH 管理阿里巴巴 Arthas Java 诊断工具，并提供 AI 驱动的性能分析能力。

## 功能特性

- **SSH 连接管理**：安全地连接远程服务器，支持连接持久化和自动重连
- **Java 进程发现**：通过 jps 列出和识别 Java 进程
- **Arthas 集成**：将 Arthas 附加到任意 Java 进程进行诊断
- **实时诊断**：执行 Arthas 命令（dashboard、thread、memory、gc 等）
- **AI 驱动的分析**：使用 AI 分析性能并提供优化建议
- **REST API**：通过 HTTP API 暴露 Arthas 功能，支持 GET/POST 方式调用

## 安装

```bash
npm install
npm run build
```

## 本地 Arthas 文件配置

将 `arthas-boot.jar` 放入 `arthas-bin` 目录（如果不存在会自动创建）：

```
arthas-manager/
└── arthas-bin/
    └── arthas-boot.jar
```

这样在执行 attach 命令时会优先使用本地文件，无需每次下载。

## 快速开始

### 1. 连接服务器

```bash
npm start -- connect
```

### 2. 列出 Java 进程

```bash
npm start -- jps <connection-id>
```

### 3. 附加 Arthas

```bash
npm start -- attach <connection-id> <pid>
```

### 4. 执行 Arthas 命令

```bash
npm start -- arthas exec <session-id> <command>
```

### 5. 启动 API 服务器

```bash
npm start -- server --port 8080
```

## 命令

### SSH 命令

| 命令 | 描述 |
|---------|-------------|
| `connect` | 连接到 SSH 服务器 |
| `disconnect <id>` | 断开服务器连接 |
| `list-connections` | 列出所有连接 |
| `jps <id>` | 列出 Java 进程 |

### Arthas 命令

| 命令 | 描述 |
|---------|-------------|
| `attach <id> <pid>` | 将 Arthas 附加到进程 |
| `arthas exec <session> <cmd>` | 执行 Arthas 命令 |
| `arthas list` | 列出活动会话 |
| `arthas stop <session>` | 停止会话 |
| `arthas commands` | 显示可用命令 |

### AI 命令

| 命令 | 描述 |
|---------|-------------|
| `ai configure` | 配置 AI 服务 |
| `ai analyze <session> [question]` | AI 性能分析 |
| `ai chat <session>` | 交互式 AI 对话 |

### 服务器命令

| 命令 | 描述 |
|---------|-------------|
| `server -h <host> -p <port>` | 启动 API 服务器 |

## REST API

启动服务器后可通过以下接口调用：

```bash
npm start -- server --port 8080
```

### 接口列表

| 端点 | 方法 | 描述 |
|----------|--------|-------------|
| `/health` | GET | 健康检查 |
| `/exec` | GET/POST | 执行 Arthas 命令 |

### 使用方式

#### GET 方式（浏览器直接访问）

```
http://localhost:8080/exec?sessionId=my-server-1785&command=dashboard
```

#### POST 方式（curl 调用）

```bash
curl -X POST http://localhost:8080/exec \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "my-server-1785", "command": "dashboard"}'
```

### 参数说明

| 参数 | 说明 |
|------|------|
| `sessionId` | 格式为 `{connectionId}-{pid}`，例如 `my-server-1785` |
| `command` | Arthas 命令，例如 `dashboard`、`thread`、`memory`、`gcutil` 等 |

### 常用命令示例

| 功能 | URL |
|------|-----|
| 查看仪表盘 | `http://localhost:8080/exec?sessionId=my-server-1785&command=dashboard` |
| 查看线程 | `http://localhost:8080/exec?sessionId=my-server-1785&command=thread` |
| 查看内存 | `http://localhost:8080/exec?sessionId=my-server-1785&command=memory` |
| 查看 GC | `http://localhost:8080/exec?sessionId=my-server-1785&command=gcutil` |
| 查看 JVM | `http://localhost:8080/exec?sessionId=my-server-1785&command=jvm` |
| 最繁忙线程 | `http://localhost:8080/exec?sessionId=my-server-1785&command=thread -n 5` |

## 配置

### AI 配置

```bash
npm start -- ai configure
```

支持的 AI 服务：
- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude)
- Ollama (本地模型)
- DeepSeek

## 常用 Arthas 命令

| 命令 | 描述 |
|---------|-------------|
| `dashboard` | 实时仪表盘 |
| `thread` | 线程信息 |
| `thread -n 5` | 最繁忙的 5 个线程 |
| `memory` | 内存使用情况 |
| `gcutil` | GC 统计信息 |
| `jvm` | JVM 信息 |
| `sysprop` | 系统属性 |

## 许可证

MIT
