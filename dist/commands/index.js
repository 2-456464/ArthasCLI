import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { sshService } from '../services/ssh.service.js';
import { arthasService } from '../services/arthas.service.js';
import { aiService } from '../services/ai.service.js';
import { ApiServer } from '../api/server.js';
export function createConnectCommand() {
    return new Command('connect')
        .description('Connect to a remote server via SSH')
        .action(async () => {
        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'id',
                message: 'Connection ID (e.g., server1):',
                default: `server-${Date.now()}`,
            },
            {
                type: 'input',
                name: 'host',
                message: 'Server hostname or IP:',
                validate: (v) => v.length > 0 || 'Host is required',
            },
            {
                type: 'number',
                name: 'port',
                message: 'SSH port:',
                default: 22,
            },
            {
                type: 'input',
                name: 'username',
                message: 'Username:',
                validate: (v) => v.length > 0 || 'Username is required',
            },
            {
                type: 'password',
                name: 'password',
                message: 'Password (leave empty for key-based auth):',
                mask: '*',
            },
        ]);
        const spinner = ora('Connecting to server...').start();
        try {
            const connection = await sshService.connect(answers.id, {
                host: answers.host,
                port: answers.port,
                username: answers.username,
                password: answers.password || undefined,
            });
            spinner.succeed(`Connected to ${answers.host} as ${answers.username}`);
            console.log(chalk.green(`Connection ID: ${connection.id}`));
        }
        catch (err) {
            spinner.fail(`Connection failed: ${err.message}`);
        }
    });
}
export function createDisconnectCommand() {
    return new Command('disconnect')
        .description('Disconnect from a server')
        .argument('<connection-id>', 'Connection ID to disconnect')
        .action(async (connectionId) => {
        const spinner = ora('Disconnecting...').start();
        try {
            await sshService.disconnect(connectionId);
            spinner.succeed(`Disconnected from ${connectionId}`);
        }
        catch (err) {
            spinner.fail(`Disconnect failed: ${err.message}`);
        }
    });
}
export function createListConnectionsCommand() {
    return new Command('list-connections')
        .description('List all SSH connections')
        .action(() => {
        const connections = sshService.getAllConnections();
        if (connections.length === 0) {
            console.log(chalk.yellow('No active connections'));
            return;
        }
        console.log(chalk.bold('\nActive SSH Connections:\n'));
        console.table(connections.map((c) => ({
            ID: c.id,
            Host: c.config.host,
            Port: c.config.port,
            Username: c.config.username,
            Connected: c.connected ? chalk.green('Yes') : chalk.red('No'),
        })));
    });
}
export function createJpsCommand() {
    return new Command('jps')
        .description('List Java processes on a server')
        .argument('<connection-id>', 'Connection ID')
        .action(async (connectionId) => {
        const spinner = ora('Fetching Java processes...').start();
        try {
            const processes = await sshService.getJavaProcesses(connectionId);
            spinner.succeed(`Found ${processes.length} Java process(es)`);
            if (processes.length === 0) {
                console.log(chalk.yellow('No Java processes found'));
                return;
            }
            console.log(chalk.bold('\nJava Processes:\n'));
            console.table(processes.map((p) => ({
                PID: p.pid,
                Name: p.name,
            })));
        }
        catch (err) {
            spinner.fail(`Failed to get Java processes: ${err.message}`);
        }
    });
}
export function createArthasAttachCommand() {
    return new Command('attach')
        .description('Attach Arthas to a Java process')
        .argument('<connection-id>', 'SSH connection ID')
        .argument('<pid>', 'Java process PID')
        .action(async (connectionId, pid) => {
        const spinner = ora(`Attaching Arthas to process ${pid}...`).start();
        try {
            const session = await arthasService.attachAndStart(connectionId, pid);
            spinner.succeed(`Arthas attached to PID ${pid}`);
            console.log(chalk.green(`Session ID: ${connectionId}-${pid}`));
            console.log(`Arthas UI: telnet localhost ${session.serverPort}`);
        }
        catch (err) {
            spinner.fail(`Failed to attach Arthas: ${err.message}`);
        }
    });
}
export function createArthasCommand() {
    const arthas = new Command('arthas')
        .description('Execute Arthas commands');
    arthas
        .command('exec')
        .description('Execute an Arthas command')
        .argument('<session-id>', 'Arthas session ID (format: connectionId-pid)')
        .argument('<command>', 'Arthas command to execute')
        .action(async (sessionId, command) => {
        const spinner = ora(`Executing Arthas command: ${command}...`).start();
        try {
            const result = await arthasService.executeArthasCommand(sessionId, command);
            if (result.success) {
                spinner.succeed('Command executed successfully');
                console.log(chalk.cyan('\nOutput:'));
                console.log(result.output);
            }
            else {
                spinner.fail('Command failed');
                if (result.error) {
                    console.log(chalk.red(`\nError: ${result.error}`));
                }
            }
        }
        catch (err) {
            spinner.fail(`Execution failed: ${err.message}`);
        }
    });
    arthas
        .command('list')
        .description('List all Arthas sessions')
        .action(() => {
        const sessions = arthasService.getAllSessions();
        if (sessions.length === 0) {
            console.log(chalk.yellow('No active Arthas sessions'));
            return;
        }
        console.log(chalk.bold('\nActive Arthas Sessions:\n'));
        console.table(sessions.map((s) => ({
            SessionID: `${s.connectionId}-${s.pid}`,
            PID: s.pid,
            Port: s.serverPort,
            Connected: s.connected ? chalk.green('Yes') : chalk.red('No'),
        })));
    });
    arthas
        .command('stop')
        .description('Stop an Arthas session')
        .argument('<session-id>', 'Session ID to stop')
        .action(async (sessionId) => {
        const spinner = ora('Stopping Arthas session...').start();
        try {
            await arthasService.stopSession(sessionId);
            spinner.succeed('Session stopped');
        }
        catch (err) {
            spinner.fail(`Stop failed: ${err.message}`);
        }
    });
    arthas
        .command('commands')
        .description('List available Arthas commands')
        .action(async () => {
        const commands = await arthasService.getCommonCommands();
        console.log(chalk.bold('\nAvailable Arthas Commands:\n'));
        for (const [cmd, desc] of Object.entries(commands)) {
            console.log(chalk.cyan(`  ${cmd.padEnd(30)}`) + desc);
        }
    });
    return arthas;
}
export function createServerCommand() {
    return new Command('server')
        .description('Start the API server')
        .option('-h, --host <host>', 'Server host', '0.0.0.0')
        .option('-p, --port <port>', 'Server port', '8080')
        .action(async (options) => {
        const server = new ApiServer({
            host: options.host,
            port: parseInt(options.port, 10),
        });
        console.log(chalk.blue(`Starting API server on ${options.host}:${options.port}...`));
        await server.start();
        console.log(chalk.green('API server is running'));
        console.log(chalk.cyan('\nAvailable endpoints:'));
        console.log('  GET  /health - Health check');
        console.log('  GET  /sessions - List Arthas sessions');
        console.log('  POST /arthas/:sessionId/command - Execute Arthas command');
        console.log('  GET  /arthas/:sessionId/metrics - Get performance metrics');
        console.log('  GET  /arthas/commands - List available commands');
        console.log('  GET  /ssh/connections - List SSH connections');
        console.log('  POST /ssh/connect - Connect to SSH server');
        console.log('  POST /ssh/:connectionId/disconnect - Disconnect SSH');
        console.log('  GET  /ssh/:connectionId/java-processes - List Java processes');
        console.log('  POST /arthas/attach - Attach Arthas to a process');
    });
}
export function createAICommand() {
    const ai = new Command('ai')
        .description('AI-powered performance analysis');
    ai
        .command('configure')
        .description('Configure AI service')
        .action(async () => {
        const answers = await inquirer.prompt([
            {
                type: 'list',
                name: 'provider',
                message: 'AI Provider:',
                choices: ['openai', 'anthropic', 'ollama', 'deepseek'],
            },
            {
                type: 'input',
                name: 'apiKey',
                message: 'API Key (leave empty for local providers):',
            },
            {
                type: 'input',
                name: 'baseUrl',
                message: 'Base URL (leave empty for default):',
            },
            {
                type: 'input',
                name: 'model',
                message: 'Model:',
                default: 'gpt-4',
            },
        ]);
        aiService.configure({
            provider: answers.provider,
            apiKey: answers.apiKey || undefined,
            baseUrl: answers.baseUrl || undefined,
            model: answers.model,
        });
        console.log(chalk.green('AI service configured successfully'));
    });
    ai
        .command('analyze')
        .description('Analyze performance of an Arthas session')
        .argument('<session-id>', 'Arthas session ID')
        .argument('[question]', 'Specific question about performance')
        .action(async (sessionId, question) => {
        if (!aiService.isConfigured()) {
            console.log(chalk.yellow('AI service not configured. Run "ai configure" first.'));
            return;
        }
        const spinner = ora('Analyzing performance...').start();
        try {
            const result = await aiService.analyzePerformance(sessionId, question || 'Please analyze the current performance of this Java application and provide optimization suggestions.');
            if (result.success && result.message) {
                spinner.succeed('Analysis complete');
                console.log(chalk.cyan('\n' + result.message));
            }
            else {
                spinner.fail(result.error || 'Analysis failed');
            }
        }
        catch (err) {
            spinner.fail(`Analysis failed: ${err.message}`);
        }
    });
    ai
        .command('chat')
        .description('Interactive AI chat about performance')
        .argument('<session-id>', 'Arthas session ID')
        .action(async (sessionId) => {
        if (!aiService.isConfigured()) {
            console.log(chalk.yellow('AI service not configured. Run "ai configure" first.'));
            return;
        }
        console.log(chalk.blue('Starting interactive AI chat (type "exit" to quit)...\n'));
        while (true) {
            const { message } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'message',
                    message: 'You:',
                },
            ]);
            if (message.toLowerCase() === 'exit') {
                console.log(chalk.blue('Goodbye!'));
                break;
            }
            const spinner = ora('AI is thinking...').start();
            try {
                const result = await aiService.chat(sessionId, message);
                spinner.stop();
                if (result.success && result.message) {
                    console.log(chalk.cyan('\nAI: ' + result.message + '\n'));
                }
                else {
                    console.log(chalk.red('Error: ' + (result.error || 'Unknown error')));
                }
            }
            catch (err) {
                spinner.fail(err.message);
            }
        }
    });
    return ai;
}
//# sourceMappingURL=index.js.map