import { arthasService } from './arthas.service.js';
export class AIService {
    config = null;
    configure(config) {
        this.config = config;
    }
    isConfigured() {
        return this.config !== null;
    }
    async analyzePerformance(sessionId, userQuestion) {
        if (!this.isConfigured()) {
            return {
                success: false,
                error: 'AI service not configured',
            };
        }
        try {
            const metrics = await arthasService.getDashboardMetrics(sessionId);
            const commands = await arthasService.getCommonCommands();
            const prompt = this.buildAnalysisPrompt(metrics, userQuestion, commands);
            const response = await this.callAI(prompt);
            return {
                success: true,
                message: response,
                analysis: this.parseAIResponse(response, metrics),
            };
        }
        catch (err) {
            return {
                success: false,
                error: err.message,
            };
        }
    }
    async chat(sessionId, message, history = []) {
        if (!this.isConfigured()) {
            return {
                success: false,
                error: 'AI service not configured',
            };
        }
        try {
            let contextMetrics = null;
            try {
                contextMetrics = await arthasService.getDashboardMetrics(sessionId);
            }
            catch {
                contextMetrics = null;
            }
            const systemPrompt = this.buildSystemPrompt(contextMetrics);
            const messages = [
                { role: 'system', content: systemPrompt },
                ...history,
                { role: 'user', content: message },
            ];
            const response = await this.callAIWithHistory(messages);
            return {
                success: true,
                message: response,
            };
        }
        catch (err) {
            return {
                success: false,
                error: err.message,
            };
        }
    }
    buildSystemPrompt(metrics) {
        let prompt = `You are an expert Java performance tuning assistant integrated with Arthas diagnostic tool. 
Your role is to help users diagnose and optimize their Java application performance.

When the user describes a performance problem, you should:
1. Use appropriate Arthas commands to gather relevant metrics
2. Analyze the metrics to identify potential issues
3. Provide specific, actionable recommendations

Available Arthas commands include:
- dashboard: Real-time dashboard showing thread, memory, GC, etc.
- thread: Show thread information  
- memory: Show memory information
- gc: Show GC information
- jvm: Show JVM information
- sysprop: Show system properties
- sc -d <class>: Show class details
- sm -d <class>: Show method details
- watch <class> <method>: Watch method invocation
- trace <class> <method>: Trace method execution time
- monitor <class> <method>: Monitor method invocation statistics`;
        if (metrics) {
            prompt += `\n\nCurrent JVM metrics:
- CPU: ${metrics.cpu ?? 'N/A'}%
- Threads: ${metrics.threads ?? 'N/A'}
- Heap Used: ${metrics.memory?.heapUsed ? `${(metrics.memory.heapUsed / 1024 / 1024).toFixed(2)} MB` : 'N/A'}
- Heap Total: ${metrics.memory?.heapTotal ? `${(metrics.memory.heapTotal / 1024 / 1024).toFixed(2)} MB` : 'N/A'}`;
        }
        prompt += `\n\nPlease provide your analysis and recommendations in the following format:
1. Issue Summary
2. Identified Problems (if any)
3. Specific Recommendations with Arthas commands to verify
4. Expected Outcome`;
        return prompt;
    }
    buildAnalysisPrompt(metrics, userQuestion, commands) {
        const prompt = `User Question: ${userQuestion}

Current JVM Performance Metrics:
${metrics.cpu !== undefined ? `- CPU Usage: ${metrics.cpu}%` : ''}
${metrics.memory ? `- Heap Memory: ${(metrics.memory.heapUsed / 1024 / 1024).toFixed(2)} MB / ${(metrics.memory.heapTotal / 1024 / 1024).toFixed(2)} MB` : ''}
${metrics.threads !== undefined ? `- Active Threads: ${metrics.threads}` : ''}
${metrics.gc ? `- GC Count: ${metrics.gc.gcCount}, GC Time: ${metrics.gc.gcTime}ms, Collector: ${metrics.gc.collectorName}` : ''}

Available Arthas Commands:
${Object.entries(commands).map(([cmd, desc]) => `- ${cmd}: ${desc}`).join('\n')}

Please analyze the performance situation and provide:
1. A brief summary of the current state
2. Any identified performance issues with severity levels
3. Specific recommendations with relevant Arthas commands to investigate further
4. Expected improvements after applying the recommendations

Format your response to be easily parseable and actionable.`;
        return prompt;
    }
    parseAIResponse(response, metrics) {
        const analysis = {
            summary: '',
            issues: [],
            recommendations: [],
            metrics: {
                cpu: metrics.cpu,
                threads: metrics.threads,
            },
        };
        if (metrics.memory) {
            analysis.metrics.memory = {
                used: metrics.memory.heapUsed,
                total: metrics.memory.heapTotal,
                percentage: (metrics.memory.heapUsed / metrics.memory.heapTotal) * 100,
            };
        }
        const lines = response.split('\n');
        let currentSection = '';
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.toLowerCase().includes('summary') || trimmed.toLowerCase().includes('overview')) {
                currentSection = 'summary';
            }
            else if (trimmed.toLowerCase().includes('issue') || trimmed.toLowerCase().includes('problem')) {
                currentSection = 'issue';
            }
            else if (trimmed.toLowerCase().includes('recommend') || trimmed.toLowerCase().includes('suggestion')) {
                currentSection = 'recommendation';
            }
            else if (trimmed && currentSection) {
                if (currentSection === 'summary') {
                    analysis.summary += trimmed + ' ';
                }
                else if (currentSection === 'recommendation') {
                    analysis.recommendations.push(trimmed);
                }
            }
        }
        if (!analysis.summary) {
            analysis.summary = response.substring(0, 200);
        }
        return analysis;
    }
    async callAI(prompt) {
        if (!this.config) {
            throw new Error('AI not configured');
        }
        const url = this.config.baseUrl
            ? `${this.config.baseUrl}/chat/completions`
            : 'https://api.openai.com/v1/chat/completions';
        const headers = {
            'Content-Type': 'application/json',
        };
        if (this.config.apiKey) {
            headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        }
        const body = {
            model: this.config.model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
        };
        if (this.config.provider === 'openai') {
            body.max_tokens = 2000;
        }
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`AI API error: ${response.status} - ${error}`);
        }
        const data = await response.json();
        return data.choices?.[0]?.message?.content || '';
    }
    async callAIWithHistory(messages) {
        if (!this.config) {
            throw new Error('AI not configured');
        }
        const url = this.config.baseUrl
            ? `${this.config.baseUrl}/chat/completions`
            : 'https://api.openai.com/v1/chat/completions';
        const headers = {
            'Content-Type': 'application/json',
        };
        if (this.config.apiKey) {
            headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        }
        const body = {
            model: this.config.model,
            messages: messages.map((m) => ({
                role: m.role,
                content: m.content,
            })),
            temperature: 0.7,
        };
        if (this.config.provider === 'openai') {
            body.max_tokens = 2000;
        }
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`AI API error: ${response.status} - ${error}`);
        }
        const data = await response.json();
        return data.choices?.[0]?.message?.content || '';
    }
}
export const aiService = new AIService();
//# sourceMappingURL=ai.service.js.map