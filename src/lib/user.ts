import { hashPassword, encodePrivateKey, decodePrivateKey, verifyPassword, generatePrivateKey } from "./crypto";
import { readSecureFile, writeSecureFile, decryptContent } from "./file";
import { saveConfig, clearConfig, getUserSession } from "./config";
import { ENV_SECURE_FILE, RequiredAuthenticationError, UserError } from "./utils";
import { validateEnvironmentName, validatePassword, validateUsername } from "./validation";

/**
 * Creates a new user in the environment file
 */
export async function createUser(username: string, password: string, filePath: string = ENV_SECURE_FILE) {
	username = validateUsername(username);
	password = validatePassword(password);

	const fileData = await readSecureFile(filePath);

	if (!fileData) {
		throw new UserError("Environment file not found. Initialize the file before creating users.");
	}

	if (fileData.users[username]) {
		throw new UserError(`User "${username}" already exists.`);
	}

	const hash = await hashPassword(password);
	const privateKey = await encodePrivateKey(password); // Generates encrypted private key

	fileData.users[username] = {
		hash,
		"private-key": privateKey,
	};

	await writeSecureFile(fileData, filePath);
	return { success: true, message: `User "${username}" created successfully.` };
}

/**
 * Authenticates a user and returns a session
 */
export async function login(username: string, password: string, persist: boolean = false, filePath: string = ENV_SECURE_FILE) {
	username = validateUsername(username);
	password = validatePassword(password);

	const fileData = await readSecureFile(filePath);

	if (!fileData) {
		throw new UserError("Environment file not found.");
	}

	const user = fileData.users[username];

	if (!user) {
		throw new UserError(`User "${username}" not found.`);
	}

	const isValid = await verifyPassword(password, user.hash);

	if (!isValid) {
		throw new UserError("Incorrect password.");
	}

	const privateKey = await decodePrivateKey(user["private-key"], password); // Decrypts private key for session

	// Saves local session with decrypted private key (protected by OS password)
	await saveConfig({
		username,
		password,
		privateKey,
		loggedInAt: new Date().toISOString(),
		persist,
	});

	return {
		success: true,
		message: `Login successful for "${username}".`,
		user: { username, environments: Object.keys(privateKey) },
	};
}

export async function changePassword(username: string, oldPassword: string, newPassword: string, filePath: string = ENV_SECURE_FILE) {
	username = validateUsername(username);
	oldPassword = validatePassword(oldPassword);
	newPassword = validatePassword(newPassword);

	const fileData = await readSecureFile(filePath);

	if (!fileData) {
		throw new UserError("Environment file not found.");
	}

	const user = fileData.users[username];

	if (!user) {
		throw new UserError(`User "${username}" not found.`);
	}

	const isValid = await verifyPassword(oldPassword, user.hash);

	if (!isValid) {
		throw new UserError("Incorrect current password.");
	}

	const newHash = await hashPassword(newPassword);

	const oldPrivateKey = await decodePrivateKey(user["private-key"], oldPassword); // Decrypts old private key

	const newPrivateKey = await encodePrivateKey(newPassword, oldPrivateKey); // Generates encrypted private key

	user.hash = newHash;
	user["private-key"] = newPrivateKey;

	await writeSecureFile(fileData, filePath);

	const session = await getAuthenticatedUser();
	if (session && session.username === username) {
		await logout(); // Clear session if the user is currently logged in
		await login(username, newPassword, session.persist, filePath); // Log in with new password to refresh session
	}

	return { success: true, message: `Password for "${username}" changed successfully.` };
}

export async function removeUser(username: string, filePath: string = ENV_SECURE_FILE) {
	username = validateUsername(username);

	const fileData = await readSecureFile(filePath);

	if (!fileData) {
		throw new UserError("Environment file not found.");
	}

	if (!fileData.users[username]) {
		throw new UserError(`User "${username}" not found.`);
	}

	delete fileData.users[username];
	await writeSecureFile(fileData, filePath);
	return { success: true, message: `User "${username}" removed successfully.` };
}

/**
 * Removes the current user's session
 */
export async function logout() {
	await clearConfig();
	return { success: true, message: "Logout successful." };
}

/**
 * Checks if the user is authenticated and returns session data
 */
export async function getAuthenticatedUser() {
	return await getUserSession();
}

export async function grantAccess(
	envName: string,
	targetUsername: string,
	password: string,
	accessType: "read-only" | "read-write",
	filePath: string = ENV_SECURE_FILE,
): Promise<{ success: boolean; message: string }> {
	throw new UserError("Granting access to other users is not implemented yet.");
}

export async function createPrivateKeyForEnvironment(envName: string, filePath: string = ENV_SECURE_FILE): Promise<{ success: boolean; message: string; privateKey?: string }> {
	envName = validateEnvironmentName(envName);

	const fileData = await readSecureFile(filePath);
	if (!fileData) {
		throw new UserError("Environment file not found.");
	}

	const session = await getAuthenticatedUser();
	if (!session) {
		throw new RequiredAuthenticationError("Login required to create private environment.");
	}

	if (!fileData.users[session.username]) {
		throw new UserError(`User not found.`);
	}

	const isValid = await verifyPassword(session.password, fileData.users[session.username].hash);

	if (!isValid) {
		throw new UserError("Incorrect password.");
	}

	const privateKey = await decodePrivateKey(fileData.users[session.username]["private-key"], session.password);

	if (privateKey[envName]) {
		return { success: true, message: `The private key for the environment "${envName}" already exists.`, privateKey: privateKey[envName] };
	}

	privateKey[envName] = generatePrivateKey();

	const encodedPrivateKey = await encodePrivateKey(session.password, privateKey);
	fileData.users[session.username]["private-key"] = encodedPrivateKey;
	await writeSecureFile(fileData, filePath);

	return { success: true, message: `Private key for environment "${envName}" created successfully.`, privateKey: privateKey[envName] };
}

/**
 * Checks if the user has access to an environment
 */
export async function hasEnvironmentAccess(envName: string, filePath: string = ENV_SECURE_FILE) {
	envName = validateEnvironmentName(envName);

	const fileData = await readSecureFile(filePath);
	if (!fileData) return { type: "public", accessible: true };

	if (!fileData.environments[envName] || fileData.environments[envName].type === "public") {
		return { type: "public", accessible: true };
	}

	const session = await getAuthenticatedUser();

	if (!session) {
		throw new RequiredAuthenticationError("Authentication required to access private environment.");
	}

	if (session.privateKey && session.privateKey[envName]) {
		return { type: "private", accessible: true };
	}

	return { type: "unknown", accessible: false };
}

/**
 * Gets the content of an environment (decrypting if necessary)
 */
export async function getEnvironmentContent(envName: string, filePath: string = ENV_SECURE_FILE): Promise<string> {
	envName = validateEnvironmentName(envName);

	const fileData = await readSecureFile(filePath);
	if (!fileData) return "";

	// Try public environment first
	if (fileData.environments[envName] && fileData.environments[envName].type === "public") {
		return fileData.environments[envName].env;
	}

	const session = await getAuthenticatedUser();

	if (!session) {
		throw new RequiredAuthenticationError("Authentication required to access private environment.");
	}

	// Try private environment for the user
	if (session.privateKey && session.privateKey[envName]) {
		return decryptContent(fileData.environments[envName].env, session.privateKey[envName]);
	}

	return "";
}
