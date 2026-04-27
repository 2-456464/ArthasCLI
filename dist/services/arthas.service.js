import { Client } from 'ssh2';
import { sshService } from './ssh.service.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
export class ArthasService {
    sessions = new Map();
    ARTHAS_VERSION = '4.1.7';
    ARTHAS_DOWNLOAD_URL = `https://github.com/alibaba/arthas/releases/download/arthas-all-${this.ARTHAS_VERSION}/arthas-boot.jar`;
    LOCAL_ARTHAS_JAR = path.join(process.cwd(), 'arthas-bin', 'arthas-boot.jar');
    configDir;
    sessionsFile;
    constructor() {
        this.configDir = path.join(os.homedir(), '.arthas-manager');
        this.sessionsFile = path.join(this.configDir, 'sessions.json');
        this.ensureConfigDir();
        this.loadSavedSessions();
    }
    ensureConfigDir() {
        if (!fs.existsSync(this.configDir)) {
            fs.mkdirSync(this.configDir, { recursive: true });
        }
        if (!fs.existsSync(this.sessionsFile)) {
            fs.writeFileSync(this.sessionsFile, JSON.stringify([], null, 2));
        }
    }
    loadSavedSessions() {
        try {
            const data = fs.readFileSync(this.sessionsFile, 'utf-8');
            const savedSessions = JSON.parse(data);
            for (const session of savedSessions) {
                this.sessions.set(`${session.connectionId}-${session.pid}`, session);
            }
        }
        catch {
            this.sessions.clear();
        }
    }
    saveSessions() {
        const sessionsArray = Array.from(this.sessions.values());
        fs.writeFileSync(this.sessionsFile, JSON.stringify(sessionsArray, null, 2));
    }
    async installArthas(connectionId, pid) {
        const sshConn = sshService.getConnection(connectionId);
        if (!sshConn || !sshConn.connected) {
            throw new Error('SSH connection not available');
        }
        const client = new Client();
        const session = await new Promise((resolve, reject) => {
            const connectConfig = {
                host: sshConn.config.host,
                port: sshConn.config.port,
                username: sshConn.config.username,
            };
            if (sshConn.config.password) {
                connectConfig.password = sshConn.config.password;
            }
            else if (sshConn.config.privateKey) {
                connectConfig.privateKey = sshConn.config.privateKey;
                if (sshConn.config.passphrase) {
                    connectConfig.passphrase = sshConn.config.passphrase;
                }
            }
            client.on('ready', () => {
                const arthasHome = `/tmp/arthas-${Date.now()}`;
                const sessionId = `${connectionId}-${pid}-${Date.now()}`;
                const session = {
                    connectionId,
                    pid,
                    arthasHome,
                    serverPort: 8563,
                    connected: false,
                };
                client.sftp((err, sftp) => {
                    if (err) {
                        client.end();
                        reject(new Error(`SFTP failed: ${err.message}`));
                        return;
                    }
                    const sftpClient = sftp;
                    sftpClient.mkdir(arthasHome, (mkdirErr) => {
                        if (mkdirErr && mkdirErr.code !== 4) {
                            client.end();
                            reject(new Error(`Failed to create Arthas home: ${mkdirErr.message}`));
                            return;
                        }
                        const remotePath = `${arthasHome}/arthas-boot.jar`;
                        this.downloadArthasBoot(sftpClient, remotePath)
                            .then(() => {
                            session.connected = true;
                            this.sessions.set(sessionId, session);
                            this.saveSessions();
                            client.end();
                            resolve(session);
                        })
                            .catch((downloadErr) => {
                            client.end();
                            reject(downloadErr);
                        });
                    });
                });
            });
            client.on('error', (err) => {
                reject(new Error(`SSH connection error: ${err.message}`));
            });
            client.connect(connectConfig);
        });
        return session;
    }
    async downloadArthasBoot(sftp, remotePath) {
        return new Promise((resolve, reject) => {
            const tempPath = path.join(os.tmpdir(), `arthas-boot-${Date.now()}.jar`);
            const file = fs.createWriteStream(tempPath);
            https.get(this.ARTHAS_DOWNLOAD_URL, (response) => {
                if (response.statusCode !== 200) {
                    file.close();
                    fs.unlinkSync(tempPath);
                    reject(new Error(`Failed to download Arthas: HTTP ${response.statusCode}`));
                    return;
                }
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    sftp.fastPut(tempPath, remotePath, (err) => {
                        fs.unlinkSync(tempPath);
                        if (err) {
                            reject(new Error(`Failed to upload Arthas: ${err.message}`));
                        }
                        else {
                            resolve();
                        }
                    });
                });
            }).on('error', (err) => {
                file.close();
                if (fs.existsSync(tempPath)) {
                    fs.unlinkSync(tempPath);
                }
                reject(err);
            });
        });
    }
    async attachAndStart(connectionId, pid) {
        let sshConn = sshService.getConnection(connectionId);
        if (!sshConn || !sshConn.connected) {
            console.log('[DEBUG] SSH not connected, attempting to reconnect...');
            const reconnected = await sshService.reconnect(connectionId);
            if (!reconnected) {
                throw new Error('SSH connection not available. Use "connect" command first.');
            }
            sshConn = sshService.getConnection(connectionId);
        }
        const remotePath = '/tmp/arthas-boot.jar';
        let localJarPath = this.LOCAL_ARTHAS_JAR;
        if (fs.existsSync(localJarPath)) {
            console.log('[DEBUG] Using local arthas-boot.jar:', localJarPath);
        }
        else {
            localJarPath = path.join(os.tmpdir(), `arthas-boot-${Date.now()}.jar`);
            console.log('[DEBUG] Local jar not found, downloading to:', localJarPath);
            await new Promise((resolve, reject) => {
                const file = fs.createWriteStream(localJarPath);
                https.get(this.ARTHAS_DOWNLOAD_URL, (response) => {
                    if (response.statusCode !== 200) {
                        file.close();
                        fs.unlinkSync(localJarPath);
                        reject(new Error(`Failed to download Arthas: HTTP ${response.statusCode}`));
                        return;
                    }
                    response.pipe(file);
                    file.on('finish', () => {
                        file.close();
                        resolve();
                    });
                }).on('error', (err) => {
                    file.close();
                    if (fs.existsSync(localJarPath))
                        fs.unlinkSync(localJarPath);
                    reject(err);
                });
            });
        }
        console.log('[DEBUG] Uploading arthas-boot.jar to remote server...');
        const conn = new Client();
        await new Promise((resolve, reject) => {
            conn.on('ready', () => {
                conn.sftp((err, sftp) => {
                    if (err) {
                        conn.end();
                        reject(new Error(`SFTP failed: ${err.message}`));
                        return;
                    }
                    sftp.fastPut(localJarPath, remotePath, (uploadErr) => {
                        conn.end();
                        if (uploadErr) {
                            reject(new Error(`Failed to upload Arthas: ${uploadErr.message}`));
                        }
                        else {
                            resolve();
                        }
                    });
                });
            });
            conn.connect({
                host: sshConn.config.host,
                port: sshConn.config.port,
                username: sshConn.config.username,
                password: sshConn.config.password,
                privateKey: sshConn.config.privateKey,
                passphrase: sshConn.config.passphrase,
            });
        });
        console.log('[DEBUG] Arthas jar uploaded to', remotePath);
        const findJps = `find /usr -name jps -type f 2>/dev/null | head -5`;
        const jpsPathResult = await sshService.executeCommand(connectionId, findJps);
        let javaCmd = 'java';
        if (jpsPathResult.success && jpsPathResult.stdout.trim()) {
            const jpsPaths = jpsPathResult.stdout.trim().split('\n');
            for (const jpsPath of jpsPaths) {
                if (jpsPath.includes('/bin/jps')) {
                    javaCmd = jpsPath.replace('/bin/jps', '/bin/java');
                    break;
                }
            }
        }
        console.log('[DEBUG] Starting Arthas with:', `nohup ${javaCmd} -jar ${remotePath} ${pid} --http-port 8563 --target-ip 0.0.0.0 > /tmp/arthas.log 2>&1 &`);
        const startCmd = `nohup ${javaCmd} -jar ${remotePath} ${pid} --http-port 8563 --target-ip 0.0.0.0 > /tmp/arthas.log 2>&1 &`;
        await sshService.executeCommand(connectionId, startCmd);
        await new Promise(resolve => setTimeout(resolve, 3000));
        console.log('[DEBUG] Arthas start command sent, checking if process is running...');
        const checkCmd = `ps aux | grep -v grep | grep arthas || echo "not_found"`;
        const checkResult = await sshService.executeCommand(connectionId, checkCmd);
        console.log('[DEBUG] Arthas process check:', checkResult.stdout);
        const sessionId = `${connectionId}-${pid}`;
        const session = {
            connectionId,
            pid,
            arthasHome: '/tmp',
            serverPort: 8563,
            connected: true,
        };
        this.sessions.set(sessionId, session);
        this.saveSessions();
        return session;
    }
    getSessionFromStorage(sessionId) {
        const savedSessions = this.loadSavedSessionsFromFile();
        return savedSessions.find(s => `${s.connectionId}-${s.pid}` === sessionId) || null;
    }
    loadSavedSessionsFromFile() {
        try {
            const data = fs.readFileSync(this.sessionsFile, 'utf-8');
            return JSON.parse(data);
        }
        catch {
            return [];
        }
    }
    async executeArthasCommand(sessionId, command) {
        let session = this.sessions.get(sessionId);
        if (!session) {
            session = this.getSessionFromStorage(sessionId);
            if (session) {
                this.sessions.set(sessionId, session);
            }
        }
        if (!session) {
            throw new Error('Arthas session not found. Use "attach" command first.');
        }
        const sshConn = sshService.getConnection(session.connectionId);
        if (!sshConn || !sshConn.connected) {
            const reconnected = await sshService.reconnect(session.connectionId);
            if (!reconnected) {
                throw new Error('SSH connection not available');
            }
        }
        console.log('[DEBUG] Executing Arthas command via HTTP API:', command);
        const escapedCommand = command.replace(/'/g, "'\\''");
        const curlCmd = `curl -s -X POST http://127.0.0.1:${session.serverPort}/api -H 'Content-Type: application/json' -d "{\\"action\\":\\"exec\\",\\"command\\":\\"${escapedCommand}\\",\\"consumerId\\":\\"arthas-manager\\"}" 2>&1`;
        const result = await sshService.executeCommand(session.connectionId, curlCmd);
        console.log('[DEBUG] Arthas HTTP response:', result.stdout);
        console.log('[DEBUG] Arthas HTTP stderr:', result.stderr);
        return {
            success: result.success && result.stdout.length > 0,
            output: result.stdout,
            error: result.stderr,
        };
    }
    async getDashboardMetrics(sessionId) {
        let session = this.sessions.get(sessionId);
        if (!session) {
            session = this.getSessionFromStorage(sessionId);
            if (session) {
                this.sessions.set(sessionId, session);
            }
        }
        if (!session) {
            throw new Error('Arthas session not found');
        }
        const metrics = {
            timestamp: Date.now(),
        };
        try {
            const threadResult = await this.executeArthasCommand(sessionId, 'thread');
            if (threadResult.success) {
                const threadMatch = threadResult.output.match(/Active:\s*(\d+)/);
                if (threadMatch) {
                    metrics.threads = parseInt(threadMatch[1], 10);
                }
            }
            const memoryResult = await this.executeArthasCommand(sessionId, 'memory');
            if (memoryResult.success) {
                const heapUsedMatch = memoryResult.output.match(/heap\s*(\d+)m\s*\/(\d+)m/i);
                if (heapUsedMatch) {
                    metrics.memory = {
                        heapUsed: parseInt(heapUsedMatch[1], 10) * 1024 * 1024,
                        heapTotal: parseInt(heapUsedMatch[2], 10) * 1024 * 1024,
                        nonHeapUsed: 0,
                        nonHeapCommitted: 0,
                    };
                }
            }
            const cpuResult = await this.executeArthasCommand(sessionId, 'dashboard -n 1');
            if (cpuResult.success) {
                const cpuMatch = cpuResult.output.match(/CPU%.*?([\d.]+)/);
                if (cpuMatch) {
                    metrics.cpu = parseFloat(cpuMatch[1]);
                }
            }
        }
        catch (err) {
            console.error('Failed to get metrics:', err);
        }
        return metrics;
    }
    async getCommonCommands() {
        return {
            dashboard: 'Real-time dashboard showing thread, memory, GC, etc.',
            thread: 'Show thread information',
            'thread -n 5': 'Show top 5 busiest threads',
            memory: 'Show memory information',
            'memory heap': 'Show heap memory details',
            'memory nonheap': 'Show non-heap memory details',
            gc: 'Show GC information',
            'gcutil -t 5': 'Show GC statistics with 5 samples',
            jvm: 'Show JVM information',
            'sysprop': 'Show system properties',
            'sysenv': 'Show system environment variables',
            'jmx': 'Show JMX information',
            'dashboard -b': 'Dashboard in batch mode',
            'thread --all': 'Show all threads',
            'sc -d <class>': 'Show class details',
            'sm -d <class>': 'Show method details of a class',
            'jad <class>': 'Decompile class',
            'watch <class> <method>': 'Watch method invocation',
            'trace <class> <method>': 'Trace method execution time',
            'stack <class> <method>': 'Show method stack trace',
            'monitor <class> <method>': 'Monitor method invocation statistics',
            'tt -t <class> <method>': 'Record method invocation',
            'ognl @java.lang.System@getProperty': 'Execute OGNL expression',
            'session': 'Show current session information',
            'quit': 'Quit Arthas session',
            'stop': 'Stop Arthas',
        };
    }
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    getAllSessions() {
        const savedSessions = this.loadSavedSessionsFromFile();
        const allSessions = new Map();
        for (const session of savedSessions) {
            allSessions.set(`${session.connectionId}-${session.pid}`, session);
        }
        for (const [id, session] of this.sessions) {
            allSessions.set(id, session);
        }
        return Array.from(allSessions.values());
    }
    async stopSession(sessionId) {
        let session = this.sessions.get(sessionId);
        if (!session) {
            session = this.getSessionFromStorage(sessionId);
        }
        if (session) {
            try {
                await this.executeArthasCommand(sessionId, 'stop');
            }
            catch (err) {
                console.error('Error stopping Arthas session:', err);
            }
            this.sessions.delete(sessionId);
            this.saveSessions();
        }
    }
    async healthCheck(sessionId) {
        let session = this.sessions.get(sessionId);
        if (!session) {
            session = this.getSessionFromStorage(sessionId);
            if (session) {
                this.sessions.set(sessionId, session);
            }
        }
        if (!session) {
            return {
                status: 'unhealthy',
                arthasConnected: false,
                sshConnected: false,
                uptime: 0,
            };
        }
        const sshConnected = sshService.isConnected(session.connectionId);
        let arthasConnected = false;
        try {
            const result = await this.executeArthasCommand(sessionId, 'session');
            arthasConnected = result.success;
        }
        catch (err) {
            arthasConnected = false;
        }
        return {
            status: arthasConnected && sshConnected ? 'healthy' : 'unhealthy',
            arthasConnected,
            sshConnected,
            pid: session.pid,
            uptime: Date.now() - new Date(session.arthasHome).getTime(),
        };
    }
}
export const arthasService = new ArthasService();
//# sourceMappingURL=arthas.service.js.map