export interface SSHConnectionConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

export interface SSHConnection {
  id: string;
  config: SSHConnectionConfig;
  connected: boolean;
  createdAt: Date;
}

export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface JavaProcess {
  pid: string;
  name: string;
  args?: string;
}

export interface ArthasConfig {
  version: string;
  downloadUrl: string;
  installPath: string;
}

export interface ArthasSession {
  connectionId: string;
  pid: string;
  arthasHome: string;
  serverPort: number;
  connected: boolean;
}

export interface ArthasCommand {
  command: string;
  sessionId?: string;
  timeout?: number;
}

export interface ArthasResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface AIConfig {
  provider: 'openai' | 'anthropic' | 'ollama' | 'deepseek';
  apiKey?: string;
  baseUrl?: string;
  model: string;
}

export interface PerformanceMetrics {
  timestamp: number;
  cpu?: number;
  memory?: MemoryMetrics;
  threads?: number;
  gc?: GCMetrics;
  methodStats?: MethodStat[];
}

export interface MemoryMetrics {
  heapUsed: number;
  heapTotal: number;
  nonHeapUsed: number;
  nonHeapCommitted: number;
}

export interface GCMetrics {
  gcCount: number;
  gcTime: number;
  collectorName: string;
}

export interface MethodStat {
  className: string;
  methodName: string;
  count: number;
  time: number;
}

export interface ApiServerConfig {
  host: string;
  port: number;
}

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  arthasConnected: boolean;
  sshConnected: boolean;
  pid?: string;
  uptime: number;
}
