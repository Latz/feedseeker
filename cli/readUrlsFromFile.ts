import { readFile } from 'node:fs/promises';

export async function readUrlsFromFile(filePath: string): Promise<string[]> {
	const content = await readFile(filePath, 'utf-8');
	return content
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !line.startsWith('#'));
}
