#!/usr/bin/env node
import { Command } from "commander";
import { initSecureFile } from "./lib/file";
import { input, RequiredAuthenticationError } from "./lib/utils";
import { changePassword, createUser, login, logout, removeUser } from "./lib/user";
import { createEnvironment, deleteEnvironment, addVariable, removeVariable, listVariables, readEnvironment, writeEnvironment } from "./lib/environment";
import { load } from "./index";
import { spawn } from "child_process";
import { editor } from "./lib/editor";

const program = new Command();

program.name("env-secure").description("Secure environment variable manager").version("1.0.0");

function handleError(callback: (this: Command, ...args: any[]) => void | Promise<void>) {
	return async function (this: Command, ...args: any[]): Promise<void> {
		try {
			await callback.apply(this, args);
		} catch (err) {
			if (err instanceof RequiredAuthenticationError) {
				return await handleError(async () => {
					console.error("Authentication required. Please login first.");
					const userName = await input("Username: ");
					const password = await input("Password: ", true);
					await login(userName, password);
					return await handleError(callback).call(this, ...args);
				}).call(this, ...args);
			}

			console.error((err as Error).message || err);
			process.exit(1);
		}
	};
}

// npx env-secure init
program
	.command("init")
	.option("-f, --force", "Overwrite existing file")
	.description("Initialize new environment file")
	.action(
		handleError(async (options) => {
			const result = await initSecureFile(options.force ? true : false);
			console.log(`Environment files created with ID: ${result.id}`);
		}),
	);

// npx env-secure create-user <username> [--password <password>]
program
	.command("create-user <username>")
	.description("Create new user")
	.option("-p, --password <password>", "User password")
	.action(
		handleError(async (username, options) => {
			if (!options.password) {
				options.password = await input("Password: ", true);
			}
			const result = await createUser(username, options.password);
			console.log(result.message);
		}),
	);

// npx env-secure login <username> [--password <password>]
program
	.command("login <username>")
	.description("Authenticate user")
	.option("-p, --password <password>", "User password")
	.action(
		handleError(async (username, options) => {
			if (!options.password) {
				options.password = await input("Password: ", true);
			}
			const result = await login(username, options.password);
			console.log(result.message);
			console.log(`User: ${result.user.username}`);
			console.log(`Private environments: ${result.user.environments.join(", ") || "none"}`);
		}),
	);

// npx env-secure logout
program
	.command("logout")
	.description("Logout user")
	.action(
		handleError(async () => {
			const result = await logout();
			console.log(result.message);
		}),
	);

// npx env-secure change-password <username> [--password <currentPassword>] [--new-password <newPassword>]
program
	.command("change-password <username>")
	.description("Change user password")
	.option("-p, --password <password>", "Current password")
	.option("-n, --new-password <newPassword>", "New password")
	.action(
		handleError(async (username, options) => {
			if (!options.password) {
				options.password = await input("Current Password: ", true);
			}

			if (!options.newPassword) {
				options.newPassword = await input("New Password: ", true);
			}

			const result = await changePassword(username, options.password, options.newPassword);
			console.log(result.message);
		}),
	);

// npx env-secure remove-user <username>
program
	.command("remove-user <username>")
	.description("Remove user")
	.action(
		handleError(async (username) => {
			const result = await removeUser(username);
			console.log(result.message);
		}),
	);

// npx env-secure create-env <env-name> [--private]
program
	.command("create-env <envName>")
	.description("Create new environment")
	.option("--private", "Create private environment (requires login)")
	.action(
		handleError(async (envName, options) => {
			envName = ["-", ".", "root", "$", "default", ""].includes(envName) ? "root" : envName;
			const result = await createEnvironment(envName, { isPrivate: options.private ? true : false });
			console.log(result.message);
		}),
	);

// npx env-secure delete-env <env-name>
program
	.command("delete-env <envName>")
	.description("Remove environment")
	.action(
		handleError(async (envName) => {
			envName = ["-", ".", "root", "$", "default", ""].includes(envName) ? "root" : envName;
			const result = await deleteEnvironment(envName);
			console.log(result.message);
		}),
	);

// npx env-secure add <env-name> --key <key> --value <value>
program
	.command("add <envName>")
	.description("Add variable to environment")
	.requiredOption("-k, --key <key>", "Variable name (ex: VAR_NAME)")
	.requiredOption("-v, --value <value>", "Variable value")
	.action(
		handleError(async (envName, options) => {
			envName = ["-", ".", "root", "$", "default", ""].includes(envName) ? "root" : envName;
			const { key: variable, value } = options;

			const result = await addVariable(envName, variable, value);
			console.log(result.message);
		}),
	);

// npx env-secure set <env-name> --key <key> --value <value>
program
	.command("set <envName>")
	.description("Set variable value in environment (creates if not exists)")
	.requiredOption("-k, --key <key>", "Variable name (ex: VAR_NAME)")
	.requiredOption("-v, --value <value>", "Variable value")
	.action(
		handleError(async (envName, options) => {
			envName = ["-", ".", "root", "$", "default", ""].includes(envName) ? "root" : envName;
			const { key: variable, value } = options;

			const result = await addVariable(envName, variable, value);
			console.log(result.message);
		}),
	);

// npx env-secure remove <env-name> --key <key>
program
	.command("remove <envName>")
	.description("Remove variable from environment")
	.requiredOption("-k, --key <key>", "Variable name (ex: VAR_NAME)")
	.action(
		handleError(async (envName, options) => {
			envName = ["-", ".", "root", "$", "default", ""].includes(envName) ? "root" : envName;
			const { key: variable } = options;

			const result = await removeVariable(envName, variable);

			console.log(result.message);
		}),
	);

// npx env-secure view <env-name>
program
	.command("view <envName>")
	.description("View variables in environment")
	.action(
		handleError(async (envName) => {
			envName = ["-", ".", "root", "$", "default", ""].includes(envName) ? "root" : envName;
			const { content } = await readEnvironment(envName);

			editor(content || `# Editing environment "${envName}"\n# Use VAR_NAME=value format`).view();

			// const result = await listVariables(envName);
			// const variables = Object.entries(result.variables);
			// console.table((variables.length > 0 ? variables : [["", ""]]).map(([key, value]) => ({ key: key, value: value })));
		}),
	);

// npx env-secure edit <env-name>
program
	.command("edit <envName>")
	.description("Edit environment variables in your default editor")
	.action(
		handleError(async (envName) => {
			envName = ["-", ".", "root", "$", "default", ""].includes(envName) ? "root" : envName;
			const { content } = await readEnvironment(envName);

			// process.stdout.write("\u001B[?1049h");

			editor(content || `# Editing environment "${envName}"\n# Use VAR_NAME=value format`)
				.writable()
				.on("data", (edited: string) => {
					// do something with the text
				})
				.on("abort", (edited: string) => {
					console.log("Edit aborted. No changes were made to the environment.");
				})
				.on("submit", async (edited: string) => {
					if (edited !== content) {
						const result = await writeEnvironment(envName, edited);
						console.log(result.message);
					} else {
						console.log("No changes made to the environment.");
					}
				});
		}),
	);

// npx env-secure load <env-name> -- <command> [args...]
program
	.command("load <envName> [--] [command...]")
	.description("Loading variables and executing commands with them injected into the load.")
	.action(
		handleError(async (envName, command, args) => {
			envName = ["-", ".", "root", "$", "default", ""].includes(envName) ? "root" : envName;

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
		}),
	);

program.parse(process.argv);

// Show help if no command is provided
if (!process.argv.slice(2).length) {
	program.outputHelp();
}
