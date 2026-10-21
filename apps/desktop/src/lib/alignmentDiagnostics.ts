import { pageFragments, resolvePdfQuote } from "./pdfSentenceLocator";
import {
	type SentencePair,
	normalizedText,
	quoteCompleteness,
	quoteMatches,
} from "./sentenceAlignment";

function targetText(element: Element): string {
	if (element.matches(".katex, math, svg, style, button, img, script"))
		return "\n\uFFFC\n";
	const block = element.matches(
		"p, h1, h2, h3, h4, h5, h6, li, td, th, br, pre",
	);
	const text = Array.from(element.childNodes)
		.map((node) =>
			node.nodeType === 3
				? (node.textContent ?? "")
				: node.nodeType === 1
					? targetText(node as Element)
					: "",
		)
		.join("");
	return block ? `\n${text}\n` : text;
}

export function alignmentCoverage(
	root: HTMLElement,
	text: HTMLElement,
	pairs: SentencePair[],
	totalPages: number,
) {
	const pdf = root.querySelector<HTMLElement>("[data-original]");
	const pages = [
		...new Set(pairs.flatMap((pair) => pair.source.map((quote) => quote.page))),
	].sort((left, right) => left - right);
	const covered = new Map<Text, { start: number; end: number }[]>();
	const entries = pairs.map((pair) => ({
		id: pair.id,
		presentInImportedData: true,
		source: pair.source.map((quote) => {
			const page =
				pdf?.querySelector<HTMLElement>(
					`.page[data-page-number="${quote.page}"]`,
				) ?? null;
			const result = resolvePdfQuote(page, quote);
			for (const range of result.ranges) {
				const node = range.startContainer as Text;
				covered.set(node, [
					...(covered.get(node) ?? []),
					{ start: range.startOffset, end: range.endOffset },
				]);
			}
			return {
				page: quote.page,
				status: result.status,
				textLayerLoaded: result.textLayerLoaded,
				matchCount: result.matchCount,
				fragments: result.fragments,
				lines: result.lines,
				order: result.order,
				completeness: quoteCompleteness(quote),
				characters: quote.text.length,
				hasContext: Boolean(quote.prefix || quote.suffix),
				hasRegion: Boolean(quote.region),
				outOfRange: totalPages > 0 && quote.page > totalPages,
			};
		}),
		target: pair.target.map((quote, quoteIndex) => {
			const section = Array.from(
				text.querySelectorAll<HTMLElement>("section"),
			).find(
				(element) =>
					(element.dataset.zoroPage
						? Number(element.dataset.zoroPage)
						: null) === quote.section,
			);
			const content = section?.querySelector("article");
			const matches = content ? quoteMatches(targetText(content), quote) : [];
			const rendered = section
				? Array.from(
						section.querySelectorAll<HTMLElement>("[data-alignment]"),
					).filter(
						(element) =>
							element.dataset.alignment === pair.id &&
							element.dataset.alignmentTargets
								?.split(" ")
								.includes(`${pair.id}:${quoteIndex}`),
					)
				: [];
			const visibleCharacters = (value: string) =>
				normalizedText(value).text.replace(/\s/g, "").length;
			const renderedCharacters = rendered.reduce(
				(sum, element) => sum + visibleCharacters(element.textContent ?? ""),
				0,
			);
			return {
				section: quote.section,
				status: !content
					? "section-unavailable"
					: matches.length > 1
						? "duplicate"
						: !matches.length
							? "not-found"
							: !rendered.length
								? "overlap-conflict"
								: renderedCharacters < visibleCharacters(quote.text)
									? "partial-conflict"
									: "matched",
				matchCount: matches.length,
				renderedParts: rendered.length,
				renderedCharacters,
				completeness: quoteCompleteness(quote),
				characters: quote.text.length,
			};
		}),
	}));
	const pageCoverage = [
		...new Set([
			...pages,
			...Array.from(
				pdf?.querySelectorAll<HTMLElement>(".page[data-page-number]") ?? [],
			).map((element) => Number(element.dataset.pageNumber)),
		]),
	]
		.sort((left, right) => left - right)
		.map((pageNumber) => {
			const page = pdf?.querySelector<HTMLElement>(
				`.page[data-page-number="${pageNumber}"]`,
			);
			const fragments = page ? pageFragments(page) : [];
			let characters = 0;
			let matchedCharacters = 0;
			let uncoveredFragments = 0;
			const uncoveredAreas: {
				fragment: number;
				region: number[];
				coveredCharacters: number;
				totalCharacters: number;
			}[] = [];
			const bounds = page?.getBoundingClientRect();
			for (const fragment of fragments) {
				characters += fragment.node.length;
				const intervals = [...(covered.get(fragment.node) ?? [])].sort(
					(left, right) => left.start - right.start,
				);
				let end = 0;
				let count = 0;
				for (const interval of intervals) {
					count += Math.max(0, interval.end - Math.max(end, interval.start));
					end = Math.max(end, interval.end);
				}
				matchedCharacters += count;
				if (count < fragment.node.length) {
					uncoveredFragments++;
					if (bounds?.width && bounds.height)
						uncoveredAreas.push({
							fragment: fragments.indexOf(fragment),
							region: [
								(fragment.rect.left - bounds.left) / bounds.width,
								(fragment.rect.top - bounds.top) / bounds.height,
								fragment.rect.width / bounds.width,
								fragment.rect.height / bounds.height,
							].map((value) => Number(value.toFixed(4))),
							coveredCharacters: count,
							totalCharacters: fragment.node.length,
						});
				}
			}
			return {
				page: pageNumber,
				groups: pairs.filter((pair) =>
					pair.source.some((quote) => quote.page === pageNumber),
				).length,
				layerLoaded: Boolean(page?.querySelector(".textLayer")),
				textFragments: fragments.length,
				uncoveredFragments,
				uncoveredAreas,
				matchedTextFraction: characters ? matchedCharacters / characters : null,
			};
		});
	return {
		schema: "zoro.alignment-diagnostics.v1",
		scope:
			"Imported selectors and currently rendered text layers only; not translation completeness. No quotes, text, filenames, paths or excerpts are exported.",
		totalPdfPages: totalPages,
		importedGroups: pairs.length,
		suppliedPages: pages,
		pagesWithoutEntries: Array.from(
			{ length: Math.min(Math.max(0, totalPages), 100000) },
			(_, index) => index + 1,
		).filter((page) => !pages.includes(page)),
		completenessNotice:
			"Declarations and punctuation checks cannot prove a full sentence. Missing punctuation may also mean a cross-page fragment. Never infer omitted translations.",
		pageCoverage,
		entries,
	};
}

export type AlignmentReport = ReturnType<typeof alignmentCoverage>;

export function diagnosticExport(
	report: AlignmentReport,
	currentPage: number,
	inspectedId: string,
) {
	return {
		...report,
		currentPage,
		inspectedId,
		presentInImportedData: report.entries.some(
			(entry) => entry.id === inspectedId,
		),
		generatedAt: new Date().toISOString(),
	};
}
