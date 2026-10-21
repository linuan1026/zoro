import { type SourceQuote, quoteMatches } from "./sentenceAlignment";

interface Fragment {
	node: Text;
	rect: DOMRect;
	order: number;
}

interface Line {
	fragments: Fragment[];
	left: number;
	right: number;
	top: number;
	bottom: number;
	height: number;
}

export type PdfMatchStatus =
	| "matched"
	| "duplicate"
	| "not-found"
	| "order-unresolved"
	| "page-not-loaded"
	| "text-layer-not-loaded"
	| "text-layer-empty"
	| "region-empty";

export interface PdfQuoteResult {
	status: PdfMatchStatus;
	ranges: Range[];
	matchCount: number;
	fragments: number;
	lines: number;
	order: "geometric" | "ambiguous";
	textLayerLoaded: boolean;
}

export function pageFragments(page: HTMLElement): Fragment[] {
	const layer = page.querySelector(".textLayer");
	if (!layer) return [];
	const walker = page.ownerDocument.createTreeWalker(
		layer,
		NodeFilter.SHOW_TEXT,
	);
	const fragments: Fragment[] = [];
	while (walker.nextNode()) {
		const node = walker.currentNode as Text;
		if (
			!node.data.trim() ||
			node.parentElement?.closest(".endOfContent, [aria-hidden='true']")
		)
			continue;
		const range = page.ownerDocument.createRange();
		range.selectNodeContents(node);
		const rect = range.getBoundingClientRect();
		if (
			rect.width <= 0 ||
			rect.height <= 0 ||
			!Number.isFinite(rect.left + rect.top)
		)
			continue;
		fragments.push({ node, rect, order: fragments.length });
	}
	return fragments;
}

function readingLines(fragments: Fragment[], pageWidth: number): Line[] {
	const rows: Fragment[][] = [];
	for (const fragment of [...fragments].sort(
		(left, right) =>
			right.rect.height - left.rect.height || left.rect.top - right.rect.top,
	)) {
		const row = rows.find((candidate) => {
			const reference = candidate[0].rect;
			const overlap =
				Math.min(reference.bottom, fragment.rect.bottom) -
				Math.max(reference.top, fragment.rect.top);
			const adjacentScript =
				fragment.rect.height <= reference.height * 0.75 &&
				overlap > 0 &&
				candidate.some(
					(item) =>
						Math.min(
							Math.abs(item.rect.right - fragment.rect.left),
							Math.abs(fragment.rect.right - item.rect.left),
						) <=
						reference.height * 0.5,
				);
			return (
				overlap >= Math.min(reference.height, fragment.rect.height) * 0.35 ||
				adjacentScript
			);
		});
		if (row) row.push(fragment);
		else rows.push([fragment]);
	}
	const lines: Line[] = [];
	for (const row of rows) {
		const sorted = row.sort(
			(left, right) =>
				left.rect.left - right.rect.left || left.order - right.order,
		);
		let chunk: Fragment[] = [];
		const append = () => {
			if (!chunk.length) return;
			lines.push({
				fragments: chunk,
				left: Math.min(...chunk.map((item) => item.rect.left)),
				right: Math.max(...chunk.map((item) => item.rect.right)),
				top: Math.min(...chunk.map((item) => item.rect.top)),
				bottom: Math.max(...chunk.map((item) => item.rect.bottom)),
				height: Math.max(...chunk.map((item) => item.rect.height)),
			});
			chunk = [];
		};
		for (const fragment of sorted) {
			const previous = chunk[chunk.length - 1];
			if (
				previous &&
				fragment.rect.left - previous.rect.right >
					Math.max(
						pageWidth * 0.025,
						Math.max(fragment.rect.height, previous.rect.height) * 2.5,
					)
			)
				append();
			chunk.push(fragment);
		}
		append();
	}
	return lines.sort(
		(left, right) => left.top - right.top || left.left - right.left,
	);
}

export function resolvePdfQuote(
	page: HTMLElement | null,
	quote: SourceQuote,
): PdfQuoteResult {
	const empty = (status: PdfMatchStatus, loaded = false): PdfQuoteResult => ({
		status,
		ranges: [],
		matchCount: 0,
		fragments: 0,
		lines: 0,
		order: status === "order-unresolved" ? "ambiguous" : "geometric",
		textLayerLoaded: loaded,
	});
	if (!page) return empty("page-not-loaded");
	if (!page.querySelector(".textLayer")) return empty("text-layer-not-loaded");
	const bounds = page.getBoundingClientRect();
	const all = pageFragments(page);
	if (!all.length) return empty("text-layer-empty", true);
	const fragments = all.filter(({ rect }) => {
		if (!quote.region) return true;
		const [left, top, width, height] = quote.region;
		const centerX = (rect.left + rect.width / 2 - bounds.left) / bounds.width;
		const centerY = (rect.top + rect.height / 2 - bounds.top) / bounds.height;
		return (
			centerX >= left &&
			centerX <= left + width &&
			centerY >= top &&
			centerY <= top + height
		);
	});
	if (!fragments.length) return empty("region-empty", true);
	const lines = readingLines(fragments, bounds.width);
	const sequences: Line[][] = [];
	let uncertain = false;
	const successors = new Map<Line, Line>();
	for (const last of lines) {
		const candidates = lines.filter(
			(line) =>
				line.top >= last.bottom - last.height * 0.25 &&
				line.top > last.top + last.height * 0.5 &&
				line.top - last.bottom <= Math.max(line.height, last.height) * 2.2 &&
				Math.min(last.right, line.right) - Math.max(last.left, line.left) > 0 &&
				Math.abs(line.left - last.left) <=
					Math.max(last.height, line.height) * 2,
		);
		candidates.sort((left, right) => left.top - right.top);
		if (!candidates.length) continue;
		const nearest = candidates.filter(
			(line) =>
				Math.abs(line.top - candidates[0].top) <
				Math.min(line.height, candidates[0].height) * 0.35,
		);
		if (nearest.length !== 1) {
			uncertain = true;
			continue;
		}
		successors.set(last, nearest[0]);
	}
	for (const first of lines) {
		const sequence = [first];
		let last = first;
		for (let step = 0; step < lines.length; step++) {
			const next = successors.get(last);
			if (!next) break;
			last = next;
			sequence.push(last);
		}
		sequences.push(sequence);
	}
	const unique = new Map<string, { ranges: Range[]; lines: number }>();
	for (const sequence of sequences) {
		let value = "";
		const leaves: {
			fragment: Fragment;
			start: number;
			end: number;
			line: number;
		}[] = [];
		for (let lineIndex = 0; lineIndex < sequence.length; lineIndex++) {
			if (value) value += "\n";
			let previous: Fragment | undefined;
			for (const fragment of sequence[lineIndex].fragments) {
				const adjacentScript =
					previous &&
					Math.min(previous.rect.height, fragment.rect.height) <=
						Math.max(previous.rect.height, fragment.rect.height) * 0.75;
				if (
					previous &&
					fragment.rect.left - previous.rect.right >
						(adjacentScript
							? Math.max(previous.rect.height, fragment.rect.height) * 0.5
							: Math.min(previous.rect.height, fragment.rect.height) * 0.15)
				)
					value += " ";
				const start = value.length;
				value += fragment.node.data;
				leaves.push({ fragment, start, end: value.length, line: lineIndex });
				previous = fragment;
			}
		}
		for (const match of quoteMatches(value, quote)) {
			const covered = leaves.filter(
				(leaf) => leaf.start < match.end && leaf.end > match.start,
			);
			const key = covered
				.map(
					(leaf) =>
						`${leaf.fragment.order}:${Math.max(0, match.start - leaf.start)}:${Math.min(leaf.end, match.end) - leaf.start}`,
				)
				.join("|");
			if (unique.has(key)) continue;
			const ranges = covered.map((leaf) => {
				const range = page.ownerDocument.createRange();
				range.setStart(
					leaf.fragment.node,
					Math.max(0, match.start - leaf.start),
				);
				range.setEnd(
					leaf.fragment.node,
					Math.min(leaf.end, match.end) - leaf.start,
				);
				return range;
			});
			unique.set(key, {
				ranges,
				lines: new Set(covered.map((leaf) => leaf.line)).size,
			});
		}
	}
	if (unique.size !== 1)
		return {
			...empty(
				unique.size
					? "duplicate"
					: uncertain
						? "order-unresolved"
						: "not-found",
				true,
			),
			matchCount: unique.size,
		};
	const match = [...unique.values()][0];
	return {
		status: "matched",
		ranges: match.ranges,
		matchCount: 1,
		fragments: match.ranges.length,
		lines: match.lines,
		order: "geometric",
		textLayerLoaded: true,
	};
}
