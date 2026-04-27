import { ArthasSession, ArthasResult, PerformanceMetrics, HealthCheckResult } from '../types/index.js';
export declare class ArthasService {
    private sessions;
    private readonly ARTHAS_VERSION;
    private readonly ARTHAS_DOWNLOAD_URL;
    private readonly LOCAL_ARTHAS_JAR;
    private configDir;
    private sessionsFile;
    constructor();
    private ensureConfigDir;
    private loadSavedSessions;
    private saveSessions;
    installArthas(connectionId: string, pid: string): Promise<ArthasSession>;
    private downloadArthasBoot;
    attachAndStart(connectionId: string, pid: string): Promise<ArthasSession>;
    private getSessionFromStorage;
    private loadSavedSessionsFromFile;
    executeArthasCommand(sessionId: string, command: string): Promise<ArthasResult>;
    getDashboardMetrics(sessionId: string): Promise<PerformanceMetrics>;
    getCommonCommands(): Promise<Record<string, string>>;
    getSession(sessionId: string): ArthasSession | undefined;
    getAllSessions(): ArthasSession[];
    stopSession(sessionId: string): Promise<void>;
    healthCheck(sessionId: string): Promise<HealthCheckResult>;
}
export declare const arthasService: ArthasService;
//# sourceMappingURL=arthas.service.d.ts.map