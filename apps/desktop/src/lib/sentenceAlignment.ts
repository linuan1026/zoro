export interface SentenceQuote {
	text: string;
	prefix?: string;
	suffix?: string;
	completeness?: "full-sentence" | "fragment" | "unknown";
}

export interface SourceQuote extends SentenceQuote {
	page: number;
	region?: [number, number, number, number];
}

export interface SentencePair {
	id: string;
	source: SourceQuote[];
	target: (SentenceQuote & { section: number | null })[];
}

export interface BilingualBundle {
	schema: "zoro.bilingual.v1";
	markdown: string;
	alignments: SentencePair[];
}

export function validatePairs(value: unknown): SentencePair[] {
	if (!Array.isArray(value) || value.length > 5000)
		throw new Error("alignment.limit");
	const ids = new Set<string>();
	for (const pair of value) {
		if (
			!pair ||
			typeof pair !== "object" ||
			typeof pair.id !== "string" ||
			!/^[a-zA-Z0-9_-]{1,80}$/.test(pair.id) ||
			ids.has(pair.id)
		)
			throw new Error("alignment.id");
		ids.add(pair.id);
		for (const side of ["source", "target"] as const) {
			if (
				!Array.isArray(pair[side]) ||
				!pair[side].length ||
				pair[side].length > 32
			)
				throw new Error("alignment.side");
			for (const quote of pair[side]) {
				if (
					quote &&
					quote.completeness !== undefined &&
					!["full-sentence", "fragment", "unknown"].includes(quote.completeness)
				)
					throw new Error("alignment.completeness");
				if (
					!quote ||
					typeof quote.text !== "string" ||
					!quote.text.trim() ||
					quote.text.length > 10000
				)
					throw new Error("alignment.quote");
				for (const key of ["prefix", "suffix"])
					if (
						quote[key] !== undefined &&
						(typeof quote[key] !== "string" || quote[key].length > 1000)
					)
						throw new Error("alignment.context");
				if (side === "source") {
					if (!Number.isSafeInteger(quote.page) || quote.page < 1)
						throw new Error("alignment.page");
					if (
						quote.region !== undefined &&
						(!Array.isArray(quote.region) ||
							quote.region.length !== 4 ||
							quote.region.some(
								(coordinate: unknown) =>
									typeof coordinate !== "number" ||
									!Number.isFinite(coordinate) ||
									coordinate < 0 ||
									coordinate > 1,
							) ||
							quote.region[2] <= 0 ||
							quote.region[3] <= 0 ||
							quote.region[0] + quote.region[2] > 1 ||
							quote.region[1] + quote.region[3] > 1)
					)
						throw new Error("alignment.region");
				} else if (
					quote.section !== null &&
					(!Number.isSafeInteger(quote.section) || quote.section < 1)
				)
					throw new Error("alignment.section");
			}
		}
	}
	return value as SentencePair[];
}

const HEADER = "<!-- zoro-alignment-v1 ";

export function importBilingualBundle(text: string): string {
	const bundle = JSON.parse(text) as BilingualBundle;
	if (
		bundle.schema !== "zoro.bilingual.v1" ||
		typeof bundle.markdown !== "string" ||
		!bundle.markdown.trim() ||
		bundle.markdown.startsWith(HEADER)
	)
		throw new Error("alignment.schema");
	const pairs = validatePairs(bundle.alignments);
	const bytes = new TextEncoder().encode(JSON.stringify(pairs));
	const encoded = btoa(
		Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""),
	);
	const content = `${HEADER}${encoded} -->\n${bundle.markdown}`;
	if (
		new TextEncoder().encode(content).length > 10 * 1024 * 1024 ||
		content.includes("\0")
	)
		throw new Error("alignment.size");
	return content;
}

export function readAlignedDocument(content: string): {
	markdown: string;
	pairs: SentencePair[];
	invalid: boolean;
} {
	if (!content.startsWith(HEADER))
		return { markdown: content, pairs: [], invalid: false };
	const end = content.indexOf(" -->\n");
	if (end < 0) return { markdown: content, pairs: [], invalid: true };
	const markdown = content.slice(end + 5);
	try {
		const bytes = Uint8Array.from(
			atob(content.slice(HEADER.length, end)),
			(character) => character.charCodeAt(0),
		);
		return {
			markdown,
			pairs: validatePairs(
				JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
			),
			invalid: false,
		};
	} catch {
		return { markdown, pairs: [], invalid: true };
	}
}

export function normalizedText(value: string) {
	const positions: { start: number; end: number }[] = [];
	let text = "";
	for (let index = 0; index < value.length; ) {
		const start = index;
		const character = String.fromCodePoint(value.codePointAt(index) ?? 0);
		index += character.length;
		if (character === "\u00ad") continue;
		if (character === "-" && /[a-z]$/.test(text)) {
			const continuation = value
				.slice(index)
				.match(/^[ \t]*\r?\n[ \t]*([a-z])/);
			if (continuation) {
				index += continuation[0].length - 1;
				continue;
			}
		}
		for (const normalized of character.normalize("NFKC")) {
			if (/\s/u.test(normalized)) {
				if (!text || text.endsWith(" ")) continue;
				text += " ";
				positions.push({ start, end: index });
			} else {
				text += normalized;
				for (let count = 0; count < normalized.length; count++)
					positions.push({ start, end: index });
			}
		}
	}
	return { text: text.trimEnd(), positions };
}

export function locateQuote(
	value: string,
	quote: SentenceQuote,
): { start: number; end: number } | null {
	const matches = quoteMatches(value, quote);
	return matches.length === 1 ? matches[0] : null;
}

export function quoteMatches(
	value: string,
	quote: SentenceQuote,
): { start: number; end: number }[] {
	const normalized = normalizedText(value);
	const needle = normalizedText(quote.text).text;
	if (!needle) return [];
	const matches: { start: number; end: number }[] = [];
	for (
		let index = normalized.text.indexOf(needle);
		index >= 0;
		index = normalized.text.indexOf(needle, index + 1)
	) {
		if (
			quote.prefix &&
			!normalized.text
				.slice(0, index)
				.trimEnd()
				.endsWith(normalizedText(quote.prefix).text)
		)
			continue;
		if (
			quote.suffix &&
			!normalized.text
				.slice(index + needle.length)
				.trimStart()
				.startsWith(normalizedText(quote.suffix).text)
		)
			continue;
		matches.push({
			start: normalized.positions[index].start,
			end: normalized.positions[index + needle.length - 1].end,
		});
	}
	return matches;
}

export function quoteCompleteness(quote: SentenceQuote) {
	if (quote.completeness === "fragment") return "declared-fragment";
	if (quote.completeness === "full-sentence") return "declared-full-unverified";
	return /[.!?。！？]["'”’）)]*$/.test(quote.text.trim())
		? "ending-present-unverified"
		: "possible-fragment";
}

interface AlignmentNode {
	type: string;
	value?: string;
	tagName?: string;
	properties?: { className?: string[]; [key: string]: unknown };
	children?: AlignmentNode[];
}

export function rehypeSentenceAlignment({
	pairs,
	section,
	activeId,
}: {
	pairs: SentencePair[];
	section: number | null;
	activeId?: string | null;
}) {
	return (tree: AlignmentNode) => {
		if (!pairs.length) return;
		const leaves: { node: AlignmentNode; start: number; end: number }[] = [];
		let text = "";
		const collect = (node: AlignmentNode) => {
			if (
				node.properties?.className?.includes("katex") ||
				["math", "svg", "script", "style"].includes(node.tagName ?? "")
			) {
				text += "\n\uFFFC\n";
				return;
			}
			if (node.type === "text") {
				const start = text.length;
				text += node.value ?? "";
				leaves.push({ node, start, end: text.length });
				return;
			}
			const block = [
				"p",
				"h1",
				"h2",
				"h3",
				"h4",
				"h5",
				"h6",
				"li",
				"td",
				"th",
				"br",
				"pre",
			].includes(node.tagName ?? "");
			if (block) text += "\n";
			for (const child of node.children ?? []) collect(child);
			if (block) text += "\n";
		};
		collect(tree);
		const ranges = pairs.flatMap((pair) =>
			pair.target.flatMap((quote, targetIndex) => {
				if (quote.section !== section) return [];
				const range = locateQuote(text, quote);
				return range ? [{ ...range, id: pair.id, targetIndex }] : [];
			}),
		);
		if (!ranges.length) return;
		for (const leaf of leaves) {
			const cuts = new Set([leaf.start, leaf.end]);
			for (const range of ranges)
				if (range.start < leaf.end && range.end > leaf.start) {
					cuts.add(Math.max(range.start, leaf.start));
					cuts.add(Math.min(range.end, leaf.end));
				}
			const boundaries = [...cuts].sort((left, right) => left - right);
			const children: AlignmentNode[] = [];
			for (let index = 0; index < boundaries.length - 1; index++) {
				const start = boundaries[index];
				const end = boundaries[index + 1];
				const ids = [
					...new Set(
						ranges
							.filter((range) => range.start <= start && range.end >= end)
							.map((range) => range.id),
					),
				];
				const child = { type: "text", value: text.slice(start, end) };
				children.push(
					ids.length === 1
						? {
								type: "element",
								tagName: "span",
								properties: {
									"data-alignment": ids[0],
									"data-alignment-targets": ranges
										.filter(
											(range) =>
												range.start <= start &&
												range.end >= end &&
												range.id === ids[0],
										)
										.map((range) => `${range.id}:${range.targetIndex}`)
										.join(" "),
									className:
										activeId === ids[0]
											? [
													"bg-yellow-200/60",
													"dark:bg-yellow-500/30",
													"rounded-sm",
												]
											: [],
								},
								children: [child],
							}
						: child,
				);
			}
			if (children.length) {
				leaf.node.type = "element";
				leaf.node.tagName = "span";
				leaf.node.properties = {};
				leaf.node.children = children;
				leaf.node.value = undefined;
			}
		}
	};
}
