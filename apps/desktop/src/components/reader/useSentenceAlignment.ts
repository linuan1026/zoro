import { type RefObject, useEffect, useState } from "react";
import {
	type SentencePair,
	type SourceQuote,
	locateQuote,
} from "../../lib/sentenceAlignment";

interface HighlightBox {
	left: number;
	top: number;
	width: number;
	height: number;
}

export function pdfQuoteRanges(page: HTMLElement, quote: SourceQuote): Range[] {
	const layer = page.querySelector<HTMLElement>(".textLayer");
	if (!layer) return [];
	const bounds = page.getBoundingClientRect();
	const walker = page.ownerDocument.createTreeWalker(
		layer,
		NodeFilter.SHOW_TEXT,
	);
	const leaves: { node: Text; start: number; end: number }[] = [];
	let value = "";
	let previous: DOMRect | null = null;
	while (walker.nextNode()) {
		const node = walker.currentNode as Text;
		if (
			!node.textContent ||
			node.parentElement?.closest("[role='presentation'].endOfContent")
		)
			continue;
		const range = page.ownerDocument.createRange();
		range.selectNodeContents(node);
		const rect = range.getBoundingClientRect();
		if (!rect.width || !rect.height) continue;
		if (quote.region) {
			const [left, top, width, height] = quote.region;
			const centerX = (rect.left + rect.width / 2 - bounds.left) / bounds.width;
			const centerY = (rect.top + rect.height / 2 - bounds.top) / bounds.height;
			if (
				centerX < left ||
				centerX > left + width ||
				centerY < top ||
				centerY > top + height
			)
				continue;
		}
		if (previous) {
			const changesColumn =
				rect.left - previous.right > bounds.width * 0.2 ||
				previous.top - rect.top > Math.max(rect.height, previous.height) * 3;
			const sameLine =
				Math.abs(rect.top - previous.top) <
				Math.max(rect.height, previous.height) * 0.65;
			value += changesColumn
				? "\n\uFFFC\n"
				: sameLine
					? rect.left - previous.right >
						Math.min(rect.height, previous.height) * 0.15
						? " "
						: ""
					: "\n";
		}
		const start = value.length;
		value += node.textContent;
		leaves.push({ node, start, end: value.length });
		previous = rect;
	}
	const match = locateQuote(value, quote);
	if (!match) return [];
	return leaves
		.filter((leaf) => leaf.start < match.end && leaf.end > match.start)
		.map((leaf) => {
			const range = page.ownerDocument.createRange();
			range.setStart(leaf.node, Math.max(0, match.start - leaf.start));
			range.setEnd(leaf.node, Math.min(leaf.end, match.end) - leaf.start);
			return range;
		});
}

export function useSentenceAlignment({
	rootRef,
	textRef,
	pairs,
	enabled,
	isActive,
	activeId,
	onHover,
	onPin,
}: {
	rootRef: RefObject<HTMLDivElement | null>;
	textRef: RefObject<HTMLDivElement | null>;
	pairs: SentencePair[];
	enabled: boolean;
	isActive: boolean;
	activeId: string | null;
	onHover: (id: string | null) => void;
	onPin: (id: string | null) => void;
}) {
	const [boxes, setBoxes] = useState<HighlightBox[]>([]);
	useEffect(() => {
		const root = rootRef.current;
		const text = textRef.current;
		const pdf = root?.querySelector<HTMLElement>("[data-original]");
		if (!root || !text || !pdf || !enabled || !isActive || !pairs.length) {
			setBoxes((previous) => (previous.length ? [] : previous));
			onHover(null);
			return;
		}
		let disposed = false;
		let frame = 0;
		let pointer: { x: number; y: number; target: Element | null } | null = null;
		const cache = new Map<string, Range[]>();
		const rangesFor = (pair: SentencePair, pageNumber?: number) =>
			pair.source.flatMap((quote, index) => {
				if (pageNumber !== undefined && quote.page !== pageNumber) return [];
				const key = `${pair.id}:${index}`;
				const cached = cache.get(key);
				if (cached) return cached;
				const page = pdf.querySelector<HTMLElement>(
					`.page[data-page-number="${quote.page}"]`,
				);
				const ranges = page ? pdfQuoteRanges(page, quote) : [];
				cache.set(key, ranges);
				return ranges;
			});
		const draw = () => {
			const pair = pairs.find((entry) => entry.id === activeId);
			const rootBounds = root.getBoundingClientRect();
			const viewport = (
				pdf.querySelector<HTMLElement>("[class*='_container_']") ?? pdf
			).getBoundingClientRect();
			const next = pair
				? rangesFor(pair)
						.flatMap((range) =>
							Array.from(range.getClientRects()).map((rect) => ({
								left:
									Math.max(rect.left, viewport.left, rootBounds.left) -
									rootBounds.left,
								top:
									Math.max(rect.top, viewport.top, rootBounds.top) -
									rootBounds.top,
								width:
									Math.min(rect.right, viewport.right, rootBounds.right) -
									Math.max(rect.left, viewport.left, rootBounds.left),
								height:
									Math.min(rect.bottom, viewport.bottom, rootBounds.bottom) -
									Math.max(rect.top, viewport.top, rootBounds.top),
							})),
						)
						.filter((box) => box.width > 0 && box.height > 0)
				: [];
			setBoxes((previous) =>
				previous.length === next.length &&
				previous.every(
					(box, index) =>
						box.left === next[index].left &&
						box.top === next[index].top &&
						box.width === next[index].width &&
						box.height === next[index].height,
				)
					? previous
					: next,
			);
		};
		const hit = () => {
			if (!pointer) return null;
			if (text.contains(pointer.target)) {
				const id =
					pointer.target?.closest<HTMLElement>("[data-alignment]")?.dataset
						.alignment;
				return pairs.some((pair) => pair.id === id) ? (id ?? null) : null;
			}
			const page = pointer.target?.closest<HTMLElement>(
				".page[data-page-number]",
			);
			if (!page || !pdf.contains(page)) return null;
			const pageNumber = Number(page.dataset.pageNumber);
			const hits = pairs.filter((pair) =>
				rangesFor(pair, pageNumber).some((range) =>
					Array.from(range.getClientRects()).some(
						(rect) =>
							pointer &&
							pointer.x >= rect.left &&
							pointer.x <= rect.right &&
							pointer.y >= rect.top &&
							pointer.y <= rect.bottom,
					),
				),
			);
			return hits.length === 1 ? hits[0].id : null;
		};
		const move = (event: PointerEvent) => {
			pointer = {
				x: event.clientX,
				y: event.clientY,
				target: event.target instanceof Element ? event.target : null,
			};
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				if (!disposed) onHover(hit());
			});
		};
		const leave = () => {
			pointer = null;
			cancelAnimationFrame(frame);
			onHover(null);
		};
		const click = (event: MouseEvent) => {
			if (
				event.target instanceof Element &&
				event.target.closest("button, a, input, select")
			)
				return;
			if (!window.getSelection()?.isCollapsed) return;
			pointer = {
				x: event.clientX,
				y: event.clientY,
				target: event.target instanceof Element ? event.target : null,
			};
			onPin(hit());
		};
		const refresh = () => {
			cache.clear();
			if (pointer) onHover(hit());
			draw();
		};
		const mutation = new MutationObserver(refresh);
		mutation.observe(pdf, {
			subtree: true,
			childList: true,
			characterData: true,
			attributes: true,
			attributeFilter: ["style", "class"],
		});
		const resize = new ResizeObserver(refresh);
		resize.observe(pdf);
		for (const element of [pdf, text]) {
			element.addEventListener("pointermove", move);
			element.addEventListener("pointerleave", leave);
			element.addEventListener("click", click);
		}
		pdf.addEventListener("scroll", draw, true);
		window.addEventListener("resize", refresh);
		draw();
		return () => {
			disposed = true;
			cancelAnimationFrame(frame);
			mutation.disconnect();
			resize.disconnect();
			for (const element of [pdf, text]) {
				element.removeEventListener("pointermove", move);
				element.removeEventListener("pointerleave", leave);
				element.removeEventListener("click", click);
			}
			pdf.removeEventListener("scroll", draw, true);
			window.removeEventListener("resize", refresh);
			cache.clear();
		};
	}, [rootRef, textRef, pairs, enabled, isActive, activeId, onHover, onPin]);
	return boxes;
}
