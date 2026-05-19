import { UserError } from "./utils";

export function validateUsername(username: string) {
	if (!username || typeof username !== "string" || username.trim() === "") {
		throw new UserError("Username is required and must be a non-empty string.");
	}
	if (username.length < 3 || username.length > 30) {
		throw new UserError("Username must be between 3 and 30 characters long.");
	}
	if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
		throw new UserError("Username can only contain letters, numbers, underscores, and hyphens.");
	}
	return username.trim();
}

export function validatePassword(password: string) {
	if (!password || typeof password !== "string") {
		throw new UserError("Password is required and must be a string.");
	}
	if (password.length < 8) {
		throw new UserError("Password must be at least 8 characters long.");
	}
	if (!/[A-Z]/.test(password)) {
		throw new UserError("Password must contain at least one uppercase letter.");
	}
	if (!/[a-z]/.test(password)) {
		throw new UserError("Password must contain at least one lowercase letter.");
	}
	if (!/[0-9]/.test(password)) {
		throw new UserError("Password must contain at least one number.");
	}
	if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
		throw new UserError("Password must contain at least one special character.");
	}
	return password;
}

export function validateEnvironmentName(envName: string) {
	if (!envName || typeof envName !== "string" || envName.trim() === "") {
		throw new UserError("Environment name is required and must be a non-empty string.");
	}
	if (envName.length < 3 || envName.length > 50) {
		throw new UserError("Environment name must be between 3 and 50 characters long.");
	}
	if (!/^[a-zA-Z0-9_-]+$/.test(envName)) {
		throw new UserError("Environment name can only contain letters, numbers, underscores, and hyphens.");
	}
	return envName.trim();
}

export function validateEnvironmentVariableKey(key: string) {
	if (!key || typeof key !== "string" || key.trim() === "") {
		throw new UserError("Environment variable key is required and must be a non-empty string.");
	}
	if (key.length < 1 || key.length > 100) {
		throw new UserError("Environment variable key must be between 1 and 100 characters long.");
	}
	if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
		throw new UserError("Environment variable key must start with a letter or underscore and can only contain letters, numbers, and underscores.");
	}
	return key.trim();
}

export function validateEnvironmentVariableValue(value: string) {
	if (!value || typeof value !== "string") {
		throw new UserError("Environment variable value is required and must be a string.");
	}
	if (value.length > 1000) {
		throw new UserError("Environment variable value must be less than 1000 characters long.");
	}
	return value;
}

export function validateEnvironmentVariable(key: string, value: string) {
	return { key: validateEnvironmentVariableKey(key), value: validateEnvironmentVariableValue(value) };
}
