#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { createConnectCommand, createDisconnectCommand, createListConnectionsCommand, createJpsCommand, createArthasAttachCommand, createArthasCommand, createServerCommand, createAICommand, } from './commands/index.js';
const program = new Command();
program
    .name('arthas-manager')
    .description('A Node.js tool for managing Arthas Java diagnostic tool via SSH')
    .version('1.0.0');
program.addCommand(createConnectCommand());
program.addCommand(createDisconnectCommand());
program.addCommand(createListConnectionsCommand());
program.addCommand(createJpsCommand());
program.addCommand(createArthasAttachCommand());
program.addCommand(createArthasCommand());
program.addCommand(createServerCommand());
program.addCommand(createAICommand());
program.parse(process.argv);
if (!process.argv.slice(2).length) {
    program.outputHelp();
}
process.on('SIGINT', async () => {
    console.log(chalk.yellow('\n\nShutting down gracefully...'));
    process.exit(0);
});
//# sourceMappingURL=index.js.map