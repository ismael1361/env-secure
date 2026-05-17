import path from "path";
import { getEnvironmentContent, getAuthenticatedUser } from "./lib/user";
import { envToJson } from "./lib/utils";
import { clearConfig } from "./lib/config";

/**
 * Loads environment variables into process.env
 * @param {string} envName - Environment name (empty for root)
 * @param {Object} options - Additional options
 * @param {string} options.filePath - Path to the .env-secure file
 * @returns {Object} Loaded variables
 */
export async function load(envName: string = "root", options: { filePath?: string } = {}) {
	try {
		let content = "";

		if (envName !== "root") {
			content += await getEnvironmentContent("", options.filePath);
		}

		content += await getEnvironmentContent(envName, options.filePath);

		if (content.trim() === "") {
			throw new Error(`Environment "${envName || "root"}" not found or access denied.`);
		}

		const variables: Record<string, string> = envToJson(content);

		Object.entries(variables).forEach(([key, value]) => {
			process.env[key] = value;
		});

		return variables;
	} catch (err) {
		// In development environment, throw the error
		// In production, you may choose to log and return empty
		if (process.env.NODE_ENV !== "production") {
			throw err;
		}
		console.warn(`Could not load environment "${envName}": ${(err as Error).message || err}`);
		return {};
	}
}

/**
 * Checks if the user is authenticated
 */
export async function isAuthenticated() {
	const user = await getAuthenticatedUser();
	return user !== null;
}

/**
 * Gets information about the authenticated user
 */
export async function getUser() {
	const user = await getAuthenticatedUser();
	return user ? { username: user.username, loggedInAt: user.loggedInAt } : null;
}

/**
 * Logs out programmatically
 */
export async function logout() {
	clearConfig();
	return true;
}
