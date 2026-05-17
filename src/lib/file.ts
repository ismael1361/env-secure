import fs from "fs";
import pako from "pako";
import { generateFileId, encrypt, decrypt } from "./crypto";
import { binary2obj, ENV_EXAMPLE_FILE, ENV_SECURE_FILE, FileError, obj2binary } from "./utils";

interface SecureFileData {
	id: string;
	createdAt?: string;
	environments: Record<string, { type: "public" | "private"; env: string }>;
	users: Record<
		string,
		{
			"hash": string;
			"private-key": string;
		}
	>;
}

const DEFAULT_STRUCTURE: SecureFileData = {
	id: "",
	environments: {
		root: {
			type: "public",
			env: "",
		},
	},
	users: {},
};

/**
 * Reads and decrypts the environment file
 */
export function readSecureFile(filePath: string = ENV_SECURE_FILE) {
	if (!fs.existsSync(filePath)) {
		return null;
	}

	try {
		const encryptedContent = fs.readFileSync(filePath, "utf8");
		const content = binary2obj<SecureFileData>(encryptedContent);
		return content;
	} catch (err) {
		// Corrupted file or invalid format
		throw new FileError(`Error reading file ${filePath}: ${(err as Error)?.message || err}`);
	}
}

/**
 * Writes the environment file (encrypted or not)
 */
export function writeSecureFile(data: SecureFileData, filePath: string = ENV_SECURE_FILE) {
	fs.writeFileSync(filePath, obj2binary(data), "utf8");
}

/**
 * Initializes a new environment file
 */
export function initSecureFile(force: boolean = false, filePath: string = ENV_SECURE_FILE) {
	if (fs.existsSync(filePath)) {
		if (force) {
			fs.unlinkSync(filePath);
		} else {
			throw new FileError(`File ${filePath} already exists. Use 'force' to overwrite.`);
		}
	}

	const newFile: SecureFileData = {
		...DEFAULT_STRUCTURE,
		id: generateFileId(),
		createdAt: new Date().toISOString(),
	};

	writeSecureFile(newFile, filePath);

	if (!fs.existsSync(ENV_EXAMPLE_FILE)) {
		fs.writeFileSync(ENV_EXAMPLE_FILE, "# Example .env file\n# VAR_NAME=value", "utf8");
	}

	return newFile;
}

/**
 * Decrypts specific content with a private token
 */
export function decryptContent(ciphertext: string, privateToken: string) {
	const compressed = decrypt(ciphertext, privateToken);
	return pako.inflate(new Uint8Array(Buffer.from(compressed, "base64")), { to: "string" });
}

/**
 * Encrypts specific content with a private token
 */
export function encryptContent(plainText: string, privateToken: string) {
	const compressed = pako.deflate(plainText);
	return encrypt(Buffer.from(compressed).toString("base64"), privateToken);
}
