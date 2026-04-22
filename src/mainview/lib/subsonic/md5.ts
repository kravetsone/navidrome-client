import SparkMD5 from "spark-md5";

export function md5(input: string): string {
	return SparkMD5.hash(input);
}

export function randomSalt(bytes = 12): string {
	const array = new Uint8Array(bytes);
	crypto.getRandomValues(array);
	return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}
