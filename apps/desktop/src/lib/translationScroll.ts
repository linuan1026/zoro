import {
	type AlignmentPoint,
	mapTranslationPosition,
} from "./offlineTranslation";

export function bindTranslationScroll(
	pdf: HTMLElement,
	text: HTMLElement,
	points: () => AlignmentPoint[],
	onPrecision: (precision: "exact" | "approximate" | "unmapped") => void,
) {
	let animation = 0;
	let disposed = false;
	let writing = false;
	let owner: "pdf" | "text" = "pdf";
	const expected: { pdf: number | null; text: number | null } = {
		pdf: null,
		text: null,
	};
	const elements = { pdf, text };
	const schedule = () => {
		cancelAnimationFrame(animation);
		animation = requestAnimationFrame(() => {
			if (disposed) return;
			const targetDirection = owner === "pdf" ? "text" : "pdf";
			const target = elements[targetDirection];
			const result = mapTranslationPosition(
				points(),
				elements[owner].scrollTop,
				owner,
				{
					pdf: Math.max(0, pdf.scrollHeight - pdf.clientHeight),
					text: Math.max(0, text.scrollHeight - text.clientHeight),
				},
			);
			onPrecision(result?.precision ?? "unmapped");
			if (!result) return;
			writing = true;
			try {
				expected[targetDirection] = result.offset;
				target.scrollTop = result.offset;
				expected[targetDirection] = target.scrollTop;
			} finally {
				writing = false;
			}
		});
	};
	const handle = (direction: "pdf" | "text") => {
		if (writing || disposed) return;
		const offset = elements[direction].scrollTop;
		if (
			expected[direction] !== null &&
			Math.abs(offset - (expected[direction] ?? 0)) < 1
		)
			return;
		expected[direction] = null;
		owner = direction;
		schedule();
	};
	const fromPdf = () => handle("pdf");
	const fromText = () => handle("text");
	pdf.addEventListener("scroll", fromPdf, { passive: true });
	text.addEventListener("scroll", fromText, { passive: true });
	schedule();
	return {
		refresh: () => {
			if (!disposed) schedule();
		},
		dispose: () => {
			disposed = true;
			cancelAnimationFrame(animation);
			pdf.removeEventListener("scroll", fromPdf);
			text.removeEventListener("scroll", fromText);
		},
	};
}
