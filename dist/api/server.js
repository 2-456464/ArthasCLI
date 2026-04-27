import http from 'http';
import { URL } from 'url';
import { arthasService } from '../services/arthas.service.js';
export class ApiServer {
    server = null;
    config;
    routes = [];
    constructor(config) {
        this.config = config;
        this.registerRoutes();
    }
    registerRoutes() {
        this.routes = [
            {
                method: 'GET',
                path: /^\/health$/,
                handler: async () => {
                    return { status: 'ok', timestamp: Date.now() };
                },
            },
            {
                method: 'GET',
                path: /^\/exec$/,
                handler: async (_, __, searchParams) => {
                    if (!searchParams) {
                        throw new Error('searchParams is required');
                    }
                    const sessionId = searchParams.get('sessionId');
                    const command = searchParams.get('command');
                    if (!sessionId || !command) {
                        throw new Error('sessionId and command are required');
                    }
                    const result = await arthasService.executeArthasCommand(sessionId, command);
                    return result;
                },
            },
            {
                method: 'POST',
                path: /^\/exec$/,
                handler: async (_, body) => {
                    const { sessionId, command } = body;
                    if (!sessionId || !command) {
                        throw new Error('sessionId and command are required');
                    }
                    const result = await arthasService.executeArthasCommand(sessionId, command);
                    return result;
                },
            },
        ];
    }
    async start() {
        return new Promise((resolve) => {
            this.server = http.createServer(async (req, res) => {
                const headers = {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                    'Content-Type': 'application/json',
                };
                if (req.method === 'OPTIONS') {
                    res.writeHead(200, headers);
                    res.end();
                    return;
                }
                let body = '';
                req.on('data', (chunk) => {
                    body += chunk;
                });
                req.on('end', async () => {
                    try {
                        const url = new URL(req.url || '/', `http://${req.headers.host}`);
                        const pathname = url.pathname;
                        const method = req.method || 'GET';
                        let matched = false;
                        for (const route of this.routes) {
                            if (route.method !== method)
                                continue;
                            const match = pathname.match(route.path);
                            if (match) {
                                const params = match.slice(1);
                                const result = await route.handler(params, JSON.parse(body || '{}'), url.searchParams);
                                res.writeHead(200, headers);
                                res.end(JSON.stringify(result));
                                matched = true;
                                break;
                            }
                        }
                        if (!matched) {
                            res.writeHead(404, headers);
                            res.end(JSON.stringify({ error: 'Not found' }));
                        }
                    }
                    catch (err) {
                        res.writeHead(500, headers);
                        res.end(JSON.stringify({ error: err.message }));
                    }
                });
            });
            this.server.listen(this.config.port, this.config.host, () => {
                console.log(`API server running at http://${this.config.host}:${this.config.port}`);
                resolve();
            });
        });
    }
    async stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    console.log('API server stopped');
                    resolve();
                });
            }
            else {
                resolve();
            }
        });
    }
}
//# sourceMappingURL=server.js.map