export interface TranslationSection {
	page: number | null;
	text: string;
}

export function splitTranslation(content: string): TranslationSection[] {
	const sections: TranslationSection[] = [];
	let page: number | null = null;
	let lines: string[] = [];
	let fence: string | null = null;
	let previousPage = 0;
	for (const line of content.split(/\r?\n/)) {
		const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
		if (fenceMatch) {
			if (!fence) fence = fenceMatch[1];
			else if (
				fenceMatch[1][0] === fence[0] &&
				fenceMatch[1].length >= fence.length
			)
				fence = null;
			lines.push(line);
			continue;
		}
		const marker =
			!fence && line.match(/^\s*<!--\s*zoro-page:\s*([1-9]\d*)\s*-->\s*$/);
		const nextPage = marker ? Number(marker[1]) : 0;
		if (marker && Number.isSafeInteger(nextPage) && nextPage > previousPage) {
			if (lines.length || page !== null)
				sections.push({ page, text: lines.join("\n") });
			page = nextPage;
			previousPage = nextPage;
			lines = [];
		} else lines.push(line);
	}
	sections.push({ page, text: lines.join("\n") });
	return sections;
}

export interface AlignmentPoint {
	pdf: number;
	text: number;
}

export function mapTranslationOffset(
	points: AlignmentPoint[],
	offset: number,
	direction: "pdf" | "text",
): number | null {
	const target = direction === "pdf" ? "text" : "pdf";
	if (!points.length || offset < points[0][direction]) return null;
	let index = 0;
	while (index + 1 < points.length && points[index + 1][direction] <= offset)
		index++;
	const start = points[index];
	const end = points[index + 1];
	if (!end) return start[target];
	const span = end[direction] - start[direction];
	if (span <= 0) return start[target];
	return (
		start[target] +
		Math.min(1, Math.max(0, (offset - start[direction]) / span)) *
			(end[target] - start[target])
	);
}

export function decodeTranslation(bytes: Uint8Array): string {
	if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("size");
	const encoding =
		bytes[0] === 0xff && bytes[1] === 0xfe
			? "utf-16le"
			: bytes[0] === 0xfe && bytes[1] === 0xff
				? "utf-16be"
				: "utf-8";
	const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
	if (!text.trim() || text.includes("\0")) throw new Error("text");
	return text;
}
