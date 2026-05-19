import CryptoJS from "crypto-js";
import bcrypt from "bcryptjs";
import pako from "pako";

const SALT_ROUNDS = 10;
const ENCRYPTION_KEY_SIZE = 32; // AES-256

/**
 * Generates a hash of the password for storage
 */
export async function hashPassword(password: string) {
	return await bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verifies a password against a stored hash
 */
export async function verifyPassword(password: string, hash: string) {
	return await bcrypt.compare(password, hash);
}

/**
 * Generates a unique ID for the environment file
 */
export function generateFileId() {
	return crypto.randomUUID();
}

/**
 * Derives an encryption key from the user's password
 */
export function deriveKey(password: string, salt: string): string {
	return CryptoJS.PBKDF2(password, CryptoJS.enc.Hex.parse(salt), {
		keySize: ENCRYPTION_KEY_SIZE / 4, // 32-bit words
		iterations: 10000,
	}).toString(CryptoJS.enc.Hex);
}

export function generatePrivateKey(): string {
	const salt = CryptoJS.lib.WordArray.random(128 / 8).toString(CryptoJS.enc.Hex);
	const key = deriveKey(CryptoJS.lib.WordArray.random(ENCRYPTION_KEY_SIZE).toString(CryptoJS.enc.Hex), salt);
	const iv = CryptoJS.lib.WordArray.random(128 / 8).toString(CryptoJS.enc.Hex);
	return [key, salt, iv].join(":");
}

export async function encodePrivateKey(password: string, privateKey: Record<string, string> = {}): Promise<string> {
	const salt = CryptoJS.lib.WordArray.random(128 / 8).toString(CryptoJS.enc.Hex);
	const key = deriveKey(password, salt);
	const iv = CryptoJS.lib.WordArray.random(128 / 8).toString(CryptoJS.enc.Hex);

	return [
		CryptoJS.AES.encrypt(JSON.stringify(privateKey), key, {
			iv: CryptoJS.enc.Hex.parse(iv),
			mode: CryptoJS.mode.CBC,
			padding: CryptoJS.pad.Pkcs7,
		}).toString(),
		salt,
		iv,
		await hashPassword(password),
	].join(":");
}

export async function decodePrivateKey(encoded: string, password: string): Promise<Record<string, string>> {
	const [encrypted, salt, iv, hash] = encoded.split(":");
	const isValid = await verifyPassword(password, hash);
	if (!isValid) {
		throw new Error("Invalid credentials.");
	}
	const key = deriveKey(password, salt);
	const decrypted = CryptoJS.AES.decrypt(encrypted, key, {
		iv: CryptoJS.enc.Hex.parse(iv),
		mode: CryptoJS.mode.CBC,
		padding: CryptoJS.pad.Pkcs7,
	});
	return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
}

export function encrypt(plainText: string, private_key: string) {
	const [key, salt, iv] = private_key.split(":");

	return CryptoJS.AES.encrypt(plainText, key, {
		iv: CryptoJS.enc.Hex.parse(iv),
		mode: CryptoJS.mode.CBC,
		padding: CryptoJS.pad.Pkcs7,
	}).toString();
}

export function decrypt(ciphertext: string, private_key: string) {
	const [key, salt, iv] = private_key.split(":");

	const decrypted = CryptoJS.AES.decrypt(ciphertext, key, {
		iv: CryptoJS.enc.Hex.parse(iv),
		mode: CryptoJS.mode.CBC,
		padding: CryptoJS.pad.Pkcs7,
	});

	return decrypted.toString(CryptoJS.enc.Utf8);
}

/**
 * Compresses and encrypts a JSON object
 */
export function encryptObject(obj: any, private_key: string) {
	const compressed = Buffer.from(pako.deflate(JSON.stringify(obj))).toString("base64");
	const encrypted = encrypt(compressed, private_key);
	return encrypted;
}

/**
 * Decrypts and decompresses to a JSON object
 */
export function decryptObject(ciphertext: string, private_key: string) {
	const decrypted = decrypt(ciphertext, private_key);
	const decompressed = pako.inflate(new Uint8Array(Buffer.from(decrypted, "base64")), { to: "string" });
	return JSON.parse(decompressed);
}
