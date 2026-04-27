import { AIConfig } from '../types/index.js';
interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}
interface AIResponse {
    success: boolean;
    message?: string;
    analysis?: PerformanceAnalysis;
    error?: string;
}
interface PerformanceAnalysis {
    summary: string;
    issues: PerformanceIssue[];
    recommendations: string[];
    metrics: {
        cpu?: number;
        memory?: {
            used: number;
            total: number;
            percentage: number;
        };
        threads?: number;
    };
}
interface PerformanceIssue {
    severity: 'low' | 'medium' | 'high' | 'critical';
    type: string;
    description: string;
    evidence?: string;
}
export declare class AIService {
    private config;
    configure(config: AIConfig): void;
    isConfigured(): boolean;
    analyzePerformance(sessionId: string, userQuestion: string): Promise<AIResponse>;
    chat(sessionId: string, message: string, history?: ChatMessage[]): Promise<AIResponse>;
    private buildSystemPrompt;
    private buildAnalysisPrompt;
    private parseAIResponse;
    private callAI;
    private callAIWithHistory;
}
export declare const aiService: AIService;
export {};
//# sourceMappingURL=ai.service.d.ts.map