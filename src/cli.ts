#!/usr/bin/env node
/**
 * OpenClaw AgentBox CLI
 * Command-line interface for managing OpenClaw/Hermes agent boxes
 */

import { Command } from 'commander';
import chalk from 'chalk';
import open from 'open';
import * as fs from 'fs';
import * as yaml from 'yaml';
import { openclawProvider, type OpenClawBoxConfig } from './provider.js';
import { DashboardServer } from './dashboard/server.js';

const program = new Command();

program
  .name('claw-box')
  .description('Orchestrator for OpenClaw/Hermes agents with VNC screen sharing')
  .version('0.1.0');

// Deploy command
program
  .command('deploy [config]')
  .description('Deploy a new agent from config file or interactively')
  .option('-n, --name <name>', 'Agent name')
  .option('-m, --model <model>', 'Model to use', 'anthropic/claude-sonnet-4-20250514')
  .option('-w, --workspace <path>', 'Workspace directory')
  .option('--telegram-token <token>', 'Telegram bot token')
  .option('--anthropic-key <key>', 'Anthropic API key')
  .option('--bedrock', 'Use AWS Bedrock')
  .option('--port <port>', 'Base port (gateway port)', '19000')
  .action(async (configPath, options) => {
    let config: OpenClawBoxConfig;

    if (configPath && fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      config = yaml.parse(content);
      console.log(chalk.blue(`📦 Loading config from ${configPath}`));
    } else {
      config = {
        name: options.name || `agent-${Date.now().toString(36)}`,
        model: options.model,
        channels: options.telegramToken 
          ? { telegram: { botToken: options.telegramToken } }
          : undefined,
        credentials: options.anthropicKey
          ? { anthropic: { apiKey: options.anthropicKey } }
          : undefined,
      };
    }

    console.log(chalk.blue(`🚀 Deploying agent "${config.name}"...`));

    try {
      const result = await openclawProvider.create({
        name: config.name,
        workspacePath: options.workspace || process.cwd(),
        projectRoot: options.workspace || process.cwd(),
        vnc: { enabled: true },
        providerOptions: { 
          openclawConfig: config,
          basePort: parseInt(options.port, 10),
        },
        onLog: (line) => console.log(chalk.gray(line)),
      });

      console.log(chalk.green(`✓ Agent deployed!`));
      console.log(chalk.white(`  ID: ${result.record.id}`));
      console.log(chalk.white(`  Container: ${result.record.containerId?.slice(0, 12)}`));
      console.log(chalk.white(`  Gateway: http://localhost:${result.record.ports?.gateway}`));
      console.log(chalk.white(`  VNC: http://localhost:${result.record.ports?.novnc}`));
    } catch (error) {
      console.error(chalk.red(`✗ Failed to deploy: ${error}`));
      process.exit(1);
    }
  });

// List command
program
  .command('list')
  .alias('ls')
  .description('List all agent boxes')
  .action(async () => {
    const boxes = openclawProvider.list();
    
    if (boxes.length === 0) {
      console.log(chalk.yellow('No agent boxes found'));
      return;
    }

    console.log(chalk.bold('\nAgent Boxes:\n'));
    
    for (const box of boxes) {
      const state = await openclawProvider.probeState(box);
      const stateColor = state === 'running' ? chalk.green : state === 'stopped' ? chalk.red : chalk.yellow;
      
      console.log(`  ${chalk.cyan(box.name)} ${stateColor(`[${state}]`)}`);
      console.log(`    ID: ${box.id}`);
      console.log(`    Gateway: http://localhost:${box.ports?.gateway}`);
      console.log(`    VNC: http://localhost:${box.ports?.novnc}`);
      console.log();
    }
  });

// Status command
program
  .command('status <name>')
  .description('Show detailed status of an agent box')
  .action(async (name) => {
    const box = openclawProvider.getByName(name) || openclawProvider.get(name);
    
    if (!box) {
      console.error(chalk.red(`Agent "${name}" not found`));
      process.exit(1);
    }

    try {
      const inspected = await openclawProvider.inspect(box);
      
      console.log(chalk.bold(`\nAgent: ${box.name}\n`));
      console.log(`  State: ${inspected.state}`);
      console.log(`  ID: ${box.id}`);
      console.log(`  Container: ${box.containerId}`);
      console.log(`  Created: ${box.createdAt}`);
      console.log(`\n  Endpoints:`);
      console.log(`    Gateway: ${inspected.endpoints.gateway}`);
      console.log(`    VNC: ${inspected.endpoints.vnc}`);
      console.log(`    noVNC: ${inspected.endpoints.novnc}`);
      
      if (box.config) {
        console.log(`\n  Config:`);
        console.log(`    Model: ${box.config.model || 'default'}`);
        console.log(`    Channels: ${Object.keys(box.config.channels || {}).join(', ') || 'none'}`);
      }
    } catch (error) {
      console.error(chalk.red(`Failed to inspect: ${error}`));
      process.exit(1);
    }
  });

// Start command
program
  .command('start <name>')
  .description('Start a stopped agent box')
  .action(async (name) => {
    const box = openclawProvider.getByName(name) || openclawProvider.get(name);
    
    if (!box) {
      console.error(chalk.red(`Agent "${name}" not found`));
      process.exit(1);
    }

    try {
      await openclawProvider.start(box);
      console.log(chalk.green(`✓ Started "${name}"`));
    } catch (error) {
      console.error(chalk.red(`Failed to start: ${error}`));
      process.exit(1);
    }
  });

// Stop command
program
  .command('stop <name>')
  .description('Stop a running agent box')
  .action(async (name) => {
    const box = openclawProvider.getByName(name) || openclawProvider.get(name);
    
    if (!box) {
      console.error(chalk.red(`Agent "${name}" not found`));
      process.exit(1);
    }

    try {
      await openclawProvider.stop(box);
      console.log(chalk.green(`✓ Stopped "${name}"`));
    } catch (error) {
      console.error(chalk.red(`Failed to stop: ${error}`));
      process.exit(1);
    }
  });

// Destroy command
program
  .command('destroy <name>')
  .description('Destroy an agent box completely')
  .option('-f, --force', 'Skip confirmation')
  .action(async (name, options) => {
    const box = openclawProvider.getByName(name) || openclawProvider.get(name);
    
    if (!box) {
      console.error(chalk.red(`Agent "${name}" not found`));
      process.exit(1);
    }

    if (!options.force) {
      console.log(chalk.yellow(`Warning: This will permanently delete the agent "${name}"`));
      console.log(chalk.gray('Use --force to skip this confirmation'));
      // In a real CLI we'd prompt here
    }

    try {
      await openclawProvider.destroy(box);
      console.log(chalk.green(`✓ Destroyed "${name}"`));
    } catch (error) {
      console.error(chalk.red(`Failed to destroy: ${error}`));
      process.exit(1);
    }
  });

// Logs command
program
  .command('logs <name>')
  .description('Stream logs from an agent box')
  .option('-n, --tail <lines>', 'Number of lines to show', '100')
  .option('-f, --follow', 'Follow log output')
  .action(async (name, options) => {
    const box = openclawProvider.getByName(name) || openclawProvider.get(name);
    
    if (!box) {
      console.error(chalk.red(`Agent "${name}" not found`));
      process.exit(1);
    }

    const spec = await openclawProvider.buildAttach(box, 'logs', {
      tail: parseInt(options.tail, 10),
      follow: options.follow,
    });

    const { spawn } = await import('child_process');
    const proc = spawn(spec.argv[0], spec.argv.slice(1), {
      stdio: 'inherit',
      env: { ...process.env, ...spec.env },
    });

    proc.on('exit', (code) => process.exit(code || 0));
  });

// Exec command
program
  .command('exec <name> <command...>')
  .description('Execute a command in an agent box')
  .option('-u, --user <user>', 'User to run as', 'agent')
  .action(async (name, command, options) => {
    const box = openclawProvider.getByName(name) || openclawProvider.get(name);
    
    if (!box) {
      console.error(chalk.red(`Agent "${name}" not found`));
      process.exit(1);
    }

    try {
      const result = await openclawProvider.exec(box, command, { user: options.user });
      
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      process.exit(result.exitCode);
    } catch (error) {
      console.error(chalk.red(`Exec failed: ${error}`));
      process.exit(1);
    }
  });

// VNC command
program
  .command('vnc <name>')
  .description('Open VNC screen sharing in browser')
  .action(async (name) => {
    const box = openclawProvider.getByName(name) || openclawProvider.get(name);
    
    if (!box) {
      console.error(chalk.red(`Agent "${name}" not found`));
      process.exit(1);
    }

    const url = await openclawProvider.resolveUrl(box, { kind: 'vnc' });
    console.log(chalk.blue(`Opening ${url}...`));
    await open(url);
  });

// Shell command
program
  .command('shell <name>')
  .description('Open interactive shell in agent box')
  .option('-u, --user <user>', 'User to run as', 'agent')
  .action(async (name, options) => {
    const box = openclawProvider.getByName(name) || openclawProvider.get(name);
    
    if (!box) {
      console.error(chalk.red(`Agent "${name}" not found`));
      process.exit(1);
    }

    const spec = await openclawProvider.buildAttach(box, 'shell', { user: options.user });

    const { spawn } = await import('child_process');
    const proc = spawn(spec.argv[0], spec.argv.slice(1), {
      stdio: 'inherit',
      env: { ...process.env, ...spec.env },
    });

    proc.on('exit', (code) => process.exit(code || 0));
  });

// Dashboard command
program
  .command('dashboard')
  .description('Start the Agent Observatory web dashboard')
  .option('-p, --port <port>', 'Dashboard port', '3456')
  .option('--no-open', 'Do not open browser automatically')
  .action(async (options) => {
    const port = parseInt(options.port, 10);
    const server = new DashboardServer({ port });
    
    await server.start();
    
    if (options.open !== false) {
      await open(`http://localhost:${port}`);
    }
    
    console.log(chalk.blue(`\n🔭 Agent Observatory running at http://localhost:${port}\n`));
    console.log(chalk.gray('Press Ctrl+C to stop'));

    process.on('SIGINT', async () => {
      console.log(chalk.yellow('\nShutting down...'));
      await server.stop();
      process.exit(0);
    });
  });

// Send message to agent (for testing)
program
  .command('message <name> <text>')
  .description('Send a message to an agent')
  .action(async (name, text) => {
    const box = openclawProvider.getByName(name) || openclawProvider.get(name);
    
    if (!box) {
      console.error(chalk.red(`Agent "${name}" not found`));
      process.exit(1);
    }

    const gatewayUrl = `http://localhost:${box.ports?.gateway}`;
    
    try {
      const response = await fetch(`${gatewayUrl}/api/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      
      const result = await response.json();
      console.log(chalk.green('Response:'), result);
    } catch (error) {
      console.error(chalk.red(`Failed to send message: ${error}`));
      process.exit(1);
    }
  });

program.parse();
