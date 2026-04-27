import { Client } from 'ssh2';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
export class SSHService {
    connections = new Map();
    clients = new Map();
    configDir;
    configFile;
    constructor() {
        this.configDir = path.join(os.homedir(), '.arthas-manager');
        this.configFile = path.join(this.configDir, 'connections.json');
        this.ensureConfigDir();
    }
    ensureConfigDir() {
        if (!fs.existsSync(this.configDir)) {
            fs.mkdirSync(this.configDir, { recursive: true });
        }
        if (!fs.existsSync(this.configFile)) {
            fs.writeFileSync(this.configFile, JSON.stringify([], null, 2));
        }
    }
    loadSavedConnections() {
        try {
            const data = fs.readFileSync(this.configFile, 'utf-8');
            return JSON.parse(data);
        }
        catch {
            return [];
        }
    }
    saveConnection(id, config) {
        const connections = this.loadSavedConnections();
        const existingIndex = connections.findIndex(c => c.id === id);
        const savedConn = {
            id,
            config,
            createdAt: new Date().toISOString(),
        };
        if (existingIndex >= 0) {
            connections[existingIndex] = savedConn;
        }
        else {
            connections.push(savedConn);
        }
        fs.writeFileSync(this.configFile, JSON.stringify(connections, null, 2));
    }
    removeSavedConnection(id) {
        const connections = this.loadSavedConnections();
        const filtered = connections.filter(c => c.id !== id);
        fs.writeFileSync(this.configFile, JSON.stringify(filtered, null, 2));
    }
    async connectWithConfig(id, config) {
        return new Promise((resolve, reject) => {
            const client = new Client();
            const connectConfig = {
                host: config.host,
                port: config.port,
                username: config.username,
            };
            if (config.password) {
                connectConfig.password = config.password;
            }
            else if (config.privateKey) {
                connectConfig.privateKey = config.privateKey;
                if (config.passphrase) {
                    connectConfig.passphrase = config.passphrase;
                }
            }
            client.on('ready', () => {
                const connection = {
                    id,
                    config,
                    connected: true,
                    createdAt: new Date(),
                };
                this.connections.set(id, connection);
                this.clients.set(id, client);
                this.saveConnection(id, config);
                resolve(connection);
            });
            client.on('error', (err) => {
                reject(new Error(`SSH connection failed: ${err.message}`));
            });
            client.on('close', () => {
                const conn = this.connections.get(id);
                if (conn) {
                    conn.connected = false;
                }
                this.clients.delete(id);
            });
            client.connect(connectConfig);
        });
    }
    async connect(id, config) {
        const existingConn = this.connections.get(id);
        if (existingConn && existingConn.connected) {
            return existingConn;
        }
        return this.connectWithConfig(id, config);
    }
    async reconnect(id) {
        const savedConnections = this.loadSavedConnections();
        const savedConn = savedConnections.find(c => c.id === id);
        if (savedConn) {
            try {
                return await this.connectWithConfig(id, savedConn.config);
            }
            catch (err) {
                console.log(`Failed to reconnect: ${err.message}`);
                return null;
            }
        }
        return null;
    }
    async disconnect(id) {
        const client = this.clients.get(id);
        if (client) {
            client.end();
            this.clients.delete(id);
        }
        this.connections.delete(id);
        this.removeSavedConnection(id);
    }
    async executeCommand(id, command) {
        let client = this.clients.get(id);
        let conn = this.connections.get(id);
        if (!conn || !conn.connected || !client) {
            const reconnected = await this.reconnect(id);
            if (!reconnected) {
                throw new Error('Not connected to SSH server. Use "connect" command first.');
            }
            client = this.clients.get(id);
            conn = this.connections.get(id);
        }
        if (!client || !conn) {
            throw new Error('Not connected to SSH server');
        }
        return new Promise((resolve) => {
            client.exec(command, (err, stream) => {
                if (err) {
                    resolve({
                        success: false,
                        stdout: '',
                        stderr: err.message,
                        exitCode: -1,
                    });
                    return;
                }
                let stdout = '';
                let stderr = '';
                stream.on('data', (data) => {
                    stdout += data.toString();
                });
                stream.stderr.on('data', (data) => {
                    stderr += data.toString();
                });
                stream.on('close', (code) => {
                    resolve({
                        success: code === 0,
                        stdout,
                        stderr,
                        exitCode: code,
                    });
                });
            });
        });
    }
    async getJavaProcesses(id) {
        const findJps = `find /usr -name jps -type f 2>/dev/null | head -5`;
        const jpsPathResult = await this.executeCommand(id, findJps);
        let jpsCmd = 'jps -l';
        if (jpsPathResult.success && jpsPathResult.stdout.trim()) {
            const jpsPaths = jpsPathResult.stdout.trim().split('\n').filter(p => p.includes('jps'));
            if (jpsPaths.length > 0) {
                jpsCmd = jpsPaths[0];
            }
        }
        else {
            const checkJvmDir = `ls -la /usr/lib/jvm/ 2>/dev/null || echo "no_jvm_dir"`;
            const jvmResult = await this.executeCommand(id, checkJvmDir);
            console.log('[DEBUG] /usr/lib/jvm/ contents:', jvmResult.stdout);
            if (jvmResult.success && !jvmResult.stdout.includes('no_jvm_dir')) {
                const jdkDirs = jvmResult.stdout.split('\n')
                    .filter(line => line.includes('java') || line.includes('jdk') || line.includes('jre'))
                    .map(line => line.split(' ').pop())
                    .filter(Boolean);
                for (const dir of jdkDirs) {
                    const jpsPath = `/usr/lib/jvm/${dir}/bin/jps`;
                    const testJps = `test -f ${jpsPath} && echo ${jpsPath} || echo ""`;
                    const testResult = await this.executeCommand(id, testJps);
                    if (testResult.success && testResult.stdout.trim()) {
                        jpsCmd = testResult.stdout.trim();
                        break;
                    }
                }
            }
        }
        console.log('[DEBUG] Using jps command:', jpsCmd);
        const result = await this.executeCommand(id, jpsCmd);
        if (!result.success) {
            throw new Error(`Failed to get Java processes: ${result.stderr}`);
        }
        const processes = [];
        const lines = result.stdout.trim().split('\n').filter(line => line.trim());
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2) {
                const pid = parts[0];
                const name = parts.slice(1).join(' ');
                if (pid && !isNaN(parseInt(pid)) && name !== 'Jps' && name !== 'sun.tools.jps.Jps') {
                    processes.push({
                        pid: pid.trim(),
                        name: name.trim(),
                    });
                }
            }
        }
        return processes;
    }
    getConnection(id) {
        return this.connections.get(id);
    }
    getAllConnections() {
        return Array.from(this.connections.values());
    }
    isConnected(id) {
        return this.connections.get(id)?.connected ?? false;
    }
    listSavedConnections() {
        return this.loadSavedConnections();
    }
}
export const sshService = new SSHService();
//# sourceMappingURL=ssh.service.js.map