import { ApiServerConfig } from '../types/index.js';
export declare class ApiServer {
    private server;
    private config;
    private routes;
    constructor(config: ApiServerConfig);
    private registerRoutes;
    start(): Promise<void>;
    stop(): Promise<void>;
}
//# sourceMappingURL=server.d.ts.map