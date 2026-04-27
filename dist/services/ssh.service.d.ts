import { SSHConnectionConfig, SSHConnection, CommandResult, JavaProcess } from '../types/index.js';
interface SavedConnection {
    id: string;
    config: SSHConnectionConfig;
    createdAt: string;
}
export declare class SSHService {
    private connections;
    private clients;
    private configDir;
    private configFile;
    constructor();
    private ensureConfigDir;
    private loadSavedConnections;
    private saveConnection;
    private removeSavedConnection;
    private connectWithConfig;
    connect(id: string, config: SSHConnectionConfig): Promise<SSHConnection>;
    reconnect(id: string): Promise<SSHConnection | null>;
    disconnect(id: string): Promise<void>;
    executeCommand(id: string, command: string): Promise<CommandResult>;
    getJavaProcesses(id: string): Promise<JavaProcess[]>;
    getConnection(id: string): SSHConnection | undefined;
    getAllConnections(): SSHConnection[];
    isConnected(id: string): boolean;
    listSavedConnections(): SavedConnection[];
}
export declare const sshService: SSHService;
export {};
//# sourceMappingURL=ssh.service.d.ts.map