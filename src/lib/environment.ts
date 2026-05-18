import { encodePrivateKey } from "./crypto";
import { readSecureFile, writeSecureFile, encryptContent } from "./file";
import { getAuthenticatedUser, hasEnvironmentAccess, getEnvironmentContent, createPrivateKeyForEnvironment } from "./user";
import { ENV_EXAMPLE_FILE, ENV_SECURE_FILE, EnvironmentError, envToJson, jsonToEnv, PermissionDeniedError, RequiredAuthenticationError } from "./utils";
import fs from "fs";

type environmentOptions = { isPrivate?: boolean };

/**
 * Create a new environment (public or private)
 */
export async function createEnvironment(envName: string, options: environmentOptions = {}, filePath: string = ENV_SECURE_FILE) {
	const { isPrivate = false } = options;
	const fileData = await readSecureFile(filePath);

	if (!fileData) {
		throw new EnvironmentError("Environment file not found. Run init first.");
	}

	// Check if the environment already exists.
	if (fileData.environments[envName]) {
		throw new EnvironmentError(`Environment "${envName}" already exists. (${fileData.environments[envName].type}).`);
	}

	if (isPrivate) {
		const session = await getAuthenticatedUser();
		if (!session) {
			throw new RequiredAuthenticationError("Login required to create private environment.");
		}

		const privateKey = await createPrivateKeyForEnvironment(envName, filePath);

		if (!privateKey.success || !privateKey.privateKey) {
			throw new EnvironmentError(`Error creating private key for environment "${envName}": ${privateKey.message}`);
		}

		// Initialize empty private environment for the user
		if (!fileData.environments[envName]) {
			fileData.environments[envName] = { type: "private", env: "" };
		}

		// Encrypt empty content with user's key
		const encrypted = encryptContent("", privateKey.privateKey);
		fileData.environments[envName].env = encrypted;
	} else {
		// Public environment
		fileData.environments[envName] = { type: "public", env: "" };
	}

	await writeSecureFile(fileData, filePath);
	return { success: true, message: `Environment "${envName}" created (${isPrivate ? "private" : "public"}).` };
}

/**
 * Remove an environment
 */
export async function deleteEnvironment(envName: string, filePath: string = ENV_SECURE_FILE) {
	const fileData = await readSecureFile(filePath);
	if (!fileData) {
		throw new EnvironmentError("Environment file not found.");
	}

	// Check if it's a public environment
	if (fileData.environments[envName] && fileData.environments[envName].type === "public") {
		delete fileData.environments[envName];
		await writeSecureFile(fileData, filePath);
		return { success: true, message: `Public environment "${envName}" removed.` };
	}

	const session = await getAuthenticatedUser();

	// Private environment: requires authentication
	if (!session) {
		throw new RequiredAuthenticationError("Authentication required to remove private environment.");
	}

	if (!session.privateKey || !session.privateKey[envName]) {
		throw new PermissionDeniedError("Permission denied to remove private environment.");
	}

	delete session.privateKey[envName];
	delete fileData.environments[envName];

	const encodedPrivateKey = await encodePrivateKey(session.password, session.privateKey);
	fileData.users[session.username]["private-key"] = encodedPrivateKey;

	await writeSecureFile(fileData, filePath);

	return { success: true, message: `Private environment "${envName}" removed.` };
}

/**
 * Adds a variable to an environment
 */
export async function addVariable(envName: string, variable: string, value: string, filePath: string = ENV_SECURE_FILE) {
	const fileData = await readSecureFile(filePath);

	if (!fileData) {
		throw new EnvironmentError("Environment file not found.");
	}

	if (!fileData.environments[envName]) {
		throw new EnvironmentError(`Environment "${envName}" not found.`);
	}

	const access = await hasEnvironmentAccess(envName, filePath);

	if (!access.accessible) {
		throw new PermissionDeniedError(`No access to environment "${envName}".`);
	}

	const content: string = await getEnvironmentContent(envName, filePath);

	const envVars: Record<string, string> = envToJson(content);

	envVars[variable] = value;

	// Rebuild content
	const newContent = jsonToEnv(envVars);

	if (access.type === "public") {
		fileData.environments[envName].env = newContent;
	} else {
		const session = await getAuthenticatedUser();
		if (!session) {
			throw new RequiredAuthenticationError("Authentication required to modify private environment.");
		}

		const encrypted = encryptContent(newContent, session.privateKey[envName]);

		fileData.environments[envName].env = encrypted;
	}

	await writeSecureFile(fileData, filePath);

	if (fs.existsSync(ENV_EXAMPLE_FILE)) {
		const exampleContent = fs.readFileSync(ENV_EXAMPLE_FILE, "utf8");
		const exampleVars = envToJson(exampleContent);
		exampleVars[variable] = "";
		fs.writeFileSync(ENV_EXAMPLE_FILE, jsonToEnv(exampleVars), "utf8");
	}

	return { success: true, message: `Variable "${variable}" added to environment "${envName}".` };
}

/**
 * Remove a variable from an environment
 */
export async function removeVariable(envName: string, variable: string, filePath: string = ENV_SECURE_FILE) {
	const fileData = await readSecureFile(filePath);

	if (!fileData) {
		throw new EnvironmentError("Environment file not found.");
	}

	if (!fileData.environments[envName]) {
		throw new EnvironmentError(`Environment "${envName}" not found.`);
	}

	const access = await hasEnvironmentAccess(envName, filePath);

	if (!access.accessible) {
		throw new PermissionDeniedError(`No access to environment "${envName}".`);
	}

	const content: string = await getEnvironmentContent(envName, filePath);

	const envVars = envToJson(content);

	delete envVars[variable];

	const newContent = jsonToEnv(envVars);

	if (access.type === "public") {
		fileData.environments[envName].env = newContent;
	} else {
		const session = await getAuthenticatedUser();
		if (!session) {
			throw new RequiredAuthenticationError("Authentication required to modify private environment.");
		}

		const encrypted = encryptContent(newContent, session.privateKey[envName]);
		fileData.environments[envName].env = encrypted;
	}

	await writeSecureFile(fileData, filePath);

	if (fs.existsSync(ENV_EXAMPLE_FILE)) {
		const exampleContent = fs.readFileSync(ENV_EXAMPLE_FILE, "utf8");
		const exampleVars = envToJson(exampleContent);
		delete exampleVars[variable];
		fs.writeFileSync(ENV_EXAMPLE_FILE, jsonToEnv(exampleVars), "utf8");
	}

	return { success: true, message: `Variable "${variable}" removed from environment "${envName}".` };
}

export async function readEnvironment(envName: string, filePath: string = ENV_SECURE_FILE) {
	const access = await hasEnvironmentAccess(envName, filePath);

	if (!access.accessible) {
		throw new PermissionDeniedError(`No access to environment "${envName}".`);
	}

	const content = await getEnvironmentContent(envName, filePath);

	return {
		success: true,
		environment: envName || "root",
		type: access.type,
		content,
	};
}

export async function writeEnvironment(envName: string, content: string, filePath: string = ENV_SECURE_FILE) {
	const access = await hasEnvironmentAccess(envName, filePath);

	if (!access.accessible) {
		throw new PermissionDeniedError(`No access to environment "${envName}".`);
	}

	if (access.type === "public") {
		const fileData = await readSecureFile(filePath);
		if (!fileData) {
			throw new EnvironmentError("Environment file not found.");
		}

		fileData.environments[envName].env = content;
		await writeSecureFile(fileData, filePath);
		return { success: true, message: `Environment "${envName}" updated.` };
	}

	const session = await getAuthenticatedUser();
	if (!session) {
		throw new RequiredAuthenticationError("Authentication required to modify private environment.");
	}

	const encrypted = encryptContent(content, session.privateKey[envName]);

	const fileData = await readSecureFile(filePath);
	if (!fileData) {
		throw new EnvironmentError("Environment file not found.");
	}
	fileData.environments[envName].env = encrypted;
	await writeSecureFile(fileData, filePath);
	return { success: true, message: `Environment "${envName}" updated.` };
}

/**
 * Lists variables of an environment
 */
export async function listVariables(envName: string, filePath: string = ENV_SECURE_FILE) {
	const { content, environment, type } = await readEnvironment(envName, filePath);

	const variables = envToJson(content, true);

	return {
		success: true,
		environment,
		type,
		variables,
	};
}
