import path from "path";
import os from "os";
import readline from "readline";

export const CONFIG_PATH = path.join(os.homedir(), ".env-secure-config").toString();

export const SESSION_PATH = process.cwd();

export const ENV_SECURE_FILE = path.join(SESSION_PATH, ".env.secure").toString();

export const ENV_EXAMPLE_FILE = path.join(SESSION_PATH, ".env.example").toString();

export function obj2binary<T>(env: T): string {
	return Buffer.from(JSON.stringify(env, null, 2), "utf-8").toString("base64");
}

export function binary2obj<T>(binary: string): T {
	return JSON.parse(Buffer.from(binary, "base64").toString("utf-8"));
}

/**
 * Converte um objeto JSON (ou string JSON) para o formato .env
 * @param {Object|string} data
 * @returns {string}
 */
export function jsonToEnv(data: Record<string, any> | string): string {
	const obj: Record<string, any> = typeof data === "string" ? JSON.parse(data) : data;

	const lines: Array<[string, any]> = [];

	for (const key in obj) {
		if (/^~~(comment|break)([-0-9]*)~~$/.test(key)) {
			const m = key.match(/^~~(comment|break)([-0-9]*)~~$/);
			if (m) {
				const index = parseInt(m[2]);
				lines[index] = [key, obj[key]];
			}
		}
	}

	for (const key in obj) {
		if (/^~~(comment|break)([-0-9]*)~~$/.test(key)) {
			continue;
		}
		const nextIndex = lines.findIndex((line) => line === undefined);
		if (nextIndex !== -1) {
			lines[nextIndex] = [key, obj[key]];
		} else {
			lines.push([key, obj[key]]);
		}
	}

	return lines
		.map(([key, value]) => {
			if (/^~~comment([-0-9]*)~~$/.test(key)) {
				return `# ${value}`;
			} else if (/^~~break([-0-9]*)~~$/.test(key)) {
				return `\n`;
			}

			// Converte tudo para string (variáveis de ambiente são sempre strings)
			const strValue = value == null ? "" : String(value);

			// Adiciona aspas se o valor contiver espaços, aspas, igualdade ou quebras de linha
			if (/[ "\n\r=]/.test(strValue)) {
				// Escapa barras invertidas e aspas internas
				const escaped = strValue.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
				return `${key}="${escaped}"`;
			}

			return `${key}=${strValue}`;
		})
		.join("\n");
}

/**
 * Converte uma string no formato .env para um objeto JSON
 * @param {string} envString
 * @returns {Object}
 */
export function envToJson(envString: string, pure: boolean = false): Record<string, any> {
	const result: Record<string, any> = {};
	const lines = envString.split("\n");

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trim();

		// Pula linhas vazias e comentários
		if (trimmed.startsWith("#")) {
			if (!pure) result[`~~comment${i}~~`] = trimmed.slice(1).trim();
			continue;
		} else if (trimmed === "") {
			if (!pure) result[`~~break${i}~~`] = "";
			continue;
		}

		// Remove prefixo 'export ' se existir
		const cleanLine = trimmed.replace(/^export\s+/i, "");
		const eqIndex = cleanLine.indexOf("=");
		if (eqIndex === -1) continue;

		const key = cleanLine.slice(0, eqIndex).trim();
		let value = cleanLine.slice(eqIndex + 1).trim();

		// Remove aspas externas (simples ou duplas) e desfaz escapes básicos
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1).replace(/\\([\\"])/g, "$1");
		}

		// Desescapa sequências comuns (\n, \t, \r)
		value = value.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\r/g, "\r");

		result[key] = value;
	}

	return result;
}

export class FileError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "FILE-ERROR";
	}
}

export class UserError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "USER-ERROR";
	}
}

export class ConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CONFIG-ERROR";
	}
}

export class EnvironmentError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ENVIRONMENT-ERROR";
	}
}

export class RequiredAuthenticationError extends Error {
	constructor(message: string = "Authentication required") {
		super(message);
		this.name = "REQUIRED-AUTHENTICATION-ERROR";
	}
}

export class PermissionDeniedError extends Error {
	constructor(message: string = "Permission denied") {
		super(message);
		this.name = "PERMISSION-DENIED-ERROR";
	}
}

export function input(prompt: string, mask: boolean = false): Promise<string> {
	return new Promise((resolve) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		// Mute the output so characters don't show
		(rl as any).stdoutMuted = mask;

		rl.question(prompt, (answer: string) => {
			rl.close();
			console.log(""); // Move to a new line after input
			resolve(answer);
		});

		// Override the internal write function to suppress echoing
		(rl as any)._writeToOutput = function _writeToOutput(stringToWrite: string) {
			if ((rl as any).stdoutMuted) {
				// Optionally print a mask like '*' instead of nothing
				(rl as any).output.write("*");
			} else {
				(rl as any).output.write(stringToWrite);
			}
		};
	});
}

/**
 * Verifica se o item é um objeto real (e não null ou array)
 */
export const isObject = (item: any): item is Record<string, any> => {
	return item && typeof item === "object" && !Array.isArray(item);
};

/**
 * Executa o merge profundo de dois ou mais objetos.
 */
export function deepMerge<T>(target: T, ...sources: T[]): T {
	if (!sources.length) return target;
	const source = sources.shift();

	if (isObject(target) && isObject(source)) {
		for (const key in source) {
			if (isObject(source[key])) {
				if (!target[key]) Object.assign(target, { [key]: {} });
				deepMerge(target[key], source[key]);
			} else if (Array.isArray(source[key])) {
				// Regra solicitada: Clona e mescla os arrays
				const targetValue = target[key] || [];
				(target as any)[key] = [...(Array.isArray(targetValue) ? targetValue : []), ...source[key]] as any;
			} else {
				// Para primitivos, apenas substitui
				Object.assign(target, { [key]: source[key] });
			}
		}
	}

	return deepMerge(target, ...sources);
}
