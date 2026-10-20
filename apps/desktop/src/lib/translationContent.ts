export function searchParts(text: string, query: string) {
	if (!query.trim()) return [{ text, match: false }];
	const expression = new RegExp(
		query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
		"giu",
	);
	const parts: { text: string; match: boolean }[] = [];
	let start = 0;
	for (const result of text.matchAll(expression)) {
		if (result.index > start)
			parts.push({ text: text.slice(start, result.index), match: false });
		parts.push({ text: result[0], match: true });
		start = result.index + result[0].length;
	}
	if (start < text.length)
		parts.push({ text: text.slice(start), match: false });
	return parts;
}

interface SearchNode {
	type: string;
	value?: string;
	tagName?: string;
	properties?: { className?: string[]; [key: string]: unknown };
	children?: SearchNode[];
}

export function rehypeTranslationSearch({ query }: { query: string }) {
	return (tree: SearchNode) => {
		const visit = (node: SearchNode) => {
			if (
				!node.children ||
				["math", "svg", "script", "style", "button", "mark"].includes(
					node.tagName ?? "",
				) ||
				node.properties?.className?.includes("katex")
			)
				return;
			node.children = node.children.flatMap((child) => {
				if (child.type === "text")
					return searchParts(child.value ?? "", query).map(
						(part): SearchNode =>
							part.match
								? {
										type: "element",
										tagName: "mark",
										properties: {
											"data-search": true,
											className: ["bg-yellow-300", "text-black"],
										},
										children: [{ type: "text", value: part.text }],
									}
								: { type: "text", value: part.text },
					);
				visit(child);
				return [child];
			});
		};
		visit(tree);
	};
}

export function safeTranslationUrl(value: string | undefined): string | null {
	if (
		!value ||
		!/^https?:\/\//i.test(value) ||
		/[\s\\]/.test(value) ||
		Array.from(value).some(
			(character) =>
				character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
		)
	)
		return null;
	try {
		const url = new URL(value);
		if (
			!url.hostname ||
			url.username ||
			url.password ||
			!["http:", "https:"].includes(url.protocol)
		)
			return null;
		return url.href;
	} catch {
		return null;
	}
}

export async function openConfirmedTranslationUrl(
	value: string,
	confirm: () => Promise<boolean>,
	open: (url: string) => Promise<unknown>,
) {
	const url = safeTranslationUrl(value);
	if (!url) throw new Error("Invalid external URL");
	if (await confirm()) await open(url);
}
