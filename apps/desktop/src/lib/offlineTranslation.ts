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
	bounds?: AlignmentPoint,
): number | null {
	return (
		mapTranslationPosition(points, offset, direction, bounds)?.offset ?? null
	);
}

export function mapTranslationPosition(
	points: AlignmentPoint[],
	offset: number,
	direction: "pdf" | "text",
	bounds?: AlignmentPoint,
): { offset: number; precision: "exact" | "approximate" } | null {
	const target = direction === "pdf" ? "text" : "pdf";
	if (!Number.isFinite(offset)) return null;
	if (
		bounds &&
		(!Number.isFinite(bounds.pdf) ||
			!Number.isFinite(bounds.text) ||
			bounds.pdf < 0 ||
			bounds.text < 0)
	)
		return null;
	const valid: AlignmentPoint[] = [];
	for (const point of points) {
		const previous = valid[valid.length - 1];
		if (
			!Number.isFinite(point.pdf) ||
			!Number.isFinite(point.text) ||
			point.pdf < 0 ||
			point.text < 0
		)
			continue;
		if (bounds && (point.pdf > bounds.pdf || point.text > bounds.text))
			continue;
		if (previous && (point.pdf <= previous.pdf || point.text <= previous.text))
			continue;
		valid.push(point);
	}
	const position = bounds
		? Math.min(bounds[direction], Math.max(0, offset))
		: offset;
	if (!valid.length || position < valid[0][direction]) return null;
	let index = 0;
	while (index + 1 < valid.length && valid[index + 1][direction] <= position)
		index++;
	const start = valid[index];
	if (Math.abs(position - start[direction]) < 0.5)
		return { offset: start[target], precision: "exact" };
	const end = valid[index + 1] ?? bounds;
	if (!end) return null;
	const span = end[direction] - start[direction];
	if (span <= 0 || end[target] < start[target]) return null;
	return {
		offset:
			start[target] +
			Math.min(1, Math.max(0, (position - start[direction]) / span)) *
				(end[target] - start[target]),
		precision: "approximate",
	};
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
