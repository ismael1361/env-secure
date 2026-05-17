#!/usr/bin/env node
import { Command } from "commander";
import { initSecureFile } from "./lib/file";
import { ENV_SECURE_FILE } from "./lib/utils";
import { createUser, login, logout } from "./lib/user";
import { createEnvironment, deleteEnvironment, addVariable, removeVariable, listVariables } from "./lib/environment";
import fs from "fs";
import { load } from "./index";
import { spawn } from "child_process";

const program = new Command();

program.name("env-secure").description("Secure environment variable manager").version("1.0.0");

// npx env-secure init
program
	.command("init")
	.option("-f, --force", "Overwrite existing file")
	.description("Initialize new environment file")
	.action((options) => {
		try {
			if (options.force) {
				if (fs.existsSync(ENV_SECURE_FILE)) fs.unlinkSync(ENV_SECURE_FILE);
			}
			const result = initSecureFile();
			console.log(`Environment files created with ID: ${result.id}`);
		} catch (err) {
			console.error((err as Error).message || err);
			process.exit(1);
		}
	});

// npx env-secure create-user <username> --password <password>
program
	.command("create-user <username>")
	.description("Create new user")
	.requiredOption("-p, --password <password>", "User password")
	.action(async (username, options) => {
		try {
			const result = await createUser(username, options.password);
			console.log(result.message);
		} catch (err) {
			console.error((err as Error).message || err);
			process.exit(1);
		}
	});

// npx env-secure login <username> --password <password>
program
	.command("login <username>")
	.description("Authenticate user")
	.requiredOption("-p, --password <password>", "User password")
	.action(async (username, options) => {
		try {
			const result = await login(username, options.password);
			console.log(result.message);
			console.log(`User: ${result.user.username}`);
			console.log(`Private environments: ${result.user.environments.join(", ") || "none"}`);
		} catch (err) {
			console.error((err as Error).message || err);
			process.exit(1);
		}
	});

// npx env-secure logout
program
	.command("logout")
	.description("Logout user")
	.action(async () => {
		try {
			const result = await logout();
			console.log(result.message);
		} catch (err) {
			console.error((err as Error).message || err);
			process.exit(1);
		}
	});

// npx env-secure create-env <env-name> [--private]
program
	.command("create-env <envName>")
	.description("Create new environment")
	.option("--private", "Create private environment (requires login)")
	.action(async (envName, options) => {
		try {
			envName = ["-", ".", "root", "$", "default", ""].includes(envName) ? "root" : envName;
			const result = await createEnvironment(envName, { isPrivate: options.private ? true : false });
			console.log(result.message);
		} catch (err) {
			console.error((err as Error).message || err);
			process.exit(1);
		}
	});

// npx env-secure delete-env <env-name>
program
	.command("delete-env <envName>")
	.description("Remove environment")
	.action(async (envName) => {
		try {
			envName = ["-", ".", "root", "$", "default", ""].includes(envName) ? "root" : envName;
			const result = await deleteEnvironment(envName);
			console.log(result.message);
		} catch (err) {
			console.error((err as Error).message || err);
			process.exit(1);
		}
	});

// npx env-secure add <env-name> --key <key> --value <value>
program
	.command("add <envName>")
	.description("Add variable to environment")
	.requiredOption("-k, --key <key>", "Variable name (ex: VAR_NAME)")
	.requiredOption("-v, --value <value>", "Variable value")
	.action(async (envName, options) => {
		try {
			envName = ["-", ".", "root", "$", "default", ""].includes(envName) ? "root" : envName;
			const { key: variable, value } = options;

			const result = await addVariable(envName, variable, value);
			console.log(result.message);
		} catch (err) {
			console.error((err as Error).message || err);
			process.exit(1);
		}
	});

// npx env-secure set <env-name> --key <key> --value <value>
program
	.command("set <envName>")
	.description("Set variable value in environment (creates if not exists)")
	.requiredOption("-k, --key <key>", "Variable name (ex: VAR_NAME)")
	.requiredOption("-v, --value <value>", "Variable value")
	.action(async (envName, options) => {
		try {
			envName = ["-", ".", "root", "$", "default", ""].includes(envName) ? "root" : envName;
			const { key: variable, value } = options;

			const result = await addVariable(envName, variable, value);
			console.log(result.message);
		} catch (err) {
			console.error((err as Error).message || err);
			process.exit(1);
		}
	});

// npx env-secure remove <env-name> --key <key>
program
	.command("remove <envName>")
	.description("Remove variable from environment")
	.requiredOption("-k, --key <key>", "Variable name (ex: VAR_NAME)")
	.action(async (envName, options) => {
		try {
			envName = ["-", ".", "root", "$", "default", ""].includes(envName) ? "root" : envName;
			const { key: variable } = options;

			const result = await removeVariable(envName, variable);

			console.log(result.message);
		} catch (err) {
			console.error((err as Error).message || err);
			process.exit(1);
		}
	});

// npx env-secure list <env-name>
program
	.command("list <envName>")
	.description("List variables in environment")
	.action(async (envName) => {
		try {
			envName = ["-", ".", "root", "$", "default", ""].includes(envName) ? "root" : envName;
			const result = await listVariables(envName);
			console.table(Object.entries(result.variables).map(([key, value]) => ({ key: key, value: value })));
		} catch (err) {
			console.error((err as Error).message || err);
			process.exit(1);
		}
	});

// npx env-secure load <env-name> -- <command> [args...]
program
	.command("load <envName> [--] [command...]")
	.description("Loading variables and executing commands with them injected into the load.")
	.action(async (envName, command, args) => {
		envName = ["-", ".", "root", "$", "default", ""].includes(envName) ? "root" : envName;

		try {
			const loaded = await load(envName);

			console.log(`Loaded ${Object.keys(loaded).length} environment variables "${envName || "root"}"`);

			// If debug is enabled, print the loaded variables
			if (process.env.ENV_SECURE_DEBUG === "1") {
				console.log("Loaded variables:", loaded);
			}

			// Execute command with spawn
			const child = spawn(command, args, {
				cwd: process.cwd(), // Keep current directory
				stdio: "inherit", // Forward stdin/stdout/stderr directly
				env: { ...process.env, ...loaded }, // Inject environment variables
				shell: true, // Allow shell features (pipes, redirects, etc)
			});

			// Forward signals (Ctrl+C, etc)
			process.on("SIGINT", () => child.kill("SIGINT"));
			process.on("SIGTERM", () => child.kill("SIGTERM"));

			// Wait for completion and forward exit code
			child.on("error", (err) => {
				console.error(`Error executing "${command}": ${err.message}`);
				if ((err as any).code === "ENOENT") {
					console.error(`Check if the command "${command}" exists and is in the PATH`);
				}
				process.exit(1);
			});

			child.on("exit", (code, signal) => {
				if (signal) {
					process.kill(process.pid, signal);
				} else {
					process.exit(code ?? 0);
				}
			});
		} catch (err) {
			console.error((err as Error).message || err);
			process.exit(1);
		}
	});

program.parse(process.argv);

// Show help if no command is provided
if (!process.argv.slice(2).length) {
	program.outputHelp();
}
