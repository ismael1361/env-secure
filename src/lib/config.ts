import fs from "fs";
import CryptoJS from "crypto-js";
import { readSecureFile } from "./file";
import { decodePrivateKey, verifyPassword } from "./crypto";
import { binary2obj, ENV_SECURE_FILE, obj2binary, CONFIG_PATH, SESSION_PATH, ConfigError } from "./utils";

interface SessionData extends Record<PropertyKey, any> {
	username: string;
	password: string;
	loggedInAt: string;
}

interface ConfigData {
	[s: string]: SessionData;
}

/**
 * Saves session configuration (protected private key)
 */
export async function saveConfig(sessionData: SessionData) {
	const password = CryptoJS.AES.encrypt(sessionData.password, process.env.ENV_SECURE_MASTER_KEY || "default-dev-key-do-not-use-in-prod").toString();

	const configData: ConfigData = {};

	try {
		const existingConfig = binary2obj<ConfigData>(fs.readFileSync(CONFIG_PATH, "utf8"));
		Object.assign(configData, existingConfig);
	} catch {}

	configData[SESSION_PATH] = {
		...sessionData,
		password,
		privateKey: undefined, // Does not save private key in the configuration file
		expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
	};

	fs.writeFileSync(CONFIG_PATH, obj2binary<ConfigData>(configData), "utf8");
	// Set restricted permissions on the file
	try {
		fs.chmodSync(CONFIG_PATH, 0o600);
	} catch {
		// Ignore on systems that do not support chmod
	}
}

/**
 * Loads session configuration
 */
export async function loadConfig(filePath: string = ENV_SECURE_FILE): Promise<SessionData | null> {
	if (!fs.existsSync(CONFIG_PATH)) return null;

	try {
		const fileData = await readSecureFile(filePath);
		if (!fileData) throw new ConfigError("Environment file not found.");

		const config = binary2obj<ConfigData>(fs.readFileSync(CONFIG_PATH, "utf8"));

		if (!config[SESSION_PATH]) return null;

		// Check expiration
		if (new Date(config[SESSION_PATH].expiresAt) < new Date()) {
			clearConfig();
			return null;
		}

		// Decrypt private key
		const masterKey = process.env.ENV_SECURE_MASTER_KEY || "default-dev-key-do-not-use-in-prod";

		const password = CryptoJS.AES.decrypt(config[SESSION_PATH].password, masterKey).toString(CryptoJS.enc.Utf8);

		if (!password) return null;
		const user = fileData.users[config[SESSION_PATH].username];

		if (!user) {
			throw new ConfigError(`User "${config[SESSION_PATH].username}" not found.`);
		}

		const isValid = await verifyPassword(password, user.hash);

		if (!isValid) {
			throw new ConfigError("Incorrect password.");
		}

		const privateKey = await decodePrivateKey(user["private-key"], password);

		return { ...config[SESSION_PATH], privateKey, password };
	} catch (err) {
		clearConfig();
		return null;
	}
}

/**
 * Removes session configuration
 */
export async function clearConfig() {
	if (!fs.existsSync(CONFIG_PATH)) return null;

	const config = binary2obj<ConfigData>(fs.readFileSync(CONFIG_PATH, "utf8"));
	delete config[SESSION_PATH];
	if (Object.keys(config).length > 0) {
		fs.writeFileSync(CONFIG_PATH, obj2binary<ConfigData>(config), "utf8");
	} else {
		fs.unlinkSync(CONFIG_PATH);
	}
}

/**
 * Returns the active user session
 */
export async function getUserSession(): Promise<{ username: string; privateKey: Record<string, string>; password: string; loggedInAt: string } | null> {
	const config = await loadConfig();
	if (!config) return null;

	return {
		username: config.username,
		password: config.password,
		privateKey: config.privateKey,
		loggedInAt: config.loggedInAt,
	};
}
