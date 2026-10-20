import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "katex/dist/katex.min.css";
import { Button } from "@/components/ui/button";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import type { OfflineTranslation } from "@/lib/commands";
import {
	mapTranslationOffset,
	splitTranslation,
} from "@/lib/offlineTranslation";
import { useAnnotationStore } from "@/stores/annotationStore";
import { PdfAnnotationViewer } from "./PdfAnnotationViewer";
import { TranslationMarkdown } from "./TranslationMarkdown";

export function BilingualTextViewer({
	document,
	paperId,
	pdfFilename,
	isActive,
}: {
	document: OfflineTranslation;
	paperId: string;
	pdfFilename?: string;
	isActive: boolean;
}) {
	const { t } = useTranslation();
	const rootRef = useRef<HTMLDivElement>(null);
	const textRef = useRef<HTMLDivElement>(null);
	const sections = useMemo(
		() => splitTranslation(document.content),
		[document.content],
	);
	const anchored = sections.some((section) => section.page !== null);
	const [sync, setSync] = useState(false);
	const [fontSize, setFontSize] = useState(17);
	const [query, setQuery] = useState("");
	const [matchIndex, setMatchIndex] = useState(0);
	const [matchCount, setMatchCount] = useState(0);
	const [pageInput, setPageInput] = useState("");
	const currentPage = useAnnotationStore((s) => s.currentPage);
	const navigateToPage = useAnnotationStore((s) => s.navigateToPage);
	const totalPages = useAnnotationStore((s) => s.totalPages);

	const handleJump = (page: number) => {
		const target = textRef.current?.querySelector<HTMLElement>(
			`[data-zoro-page="${page}"]`,
		);
		if (target && textRef.current) textRef.current.scrollTop = target.offsetTop;
	};

	useEffect(() => {
		const root = rootRef.current;
		const text = textRef.current;
		if (!root || !text || !sync || !isActive || !anchored) return;
		let cleanup: (() => void) | undefined;
		const attach = () => {
			const pdf = root.querySelector<HTMLElement>(
				"[data-original] [class*='_container_']",
			);
			if (!pdf) return false;
			let expectedPdf: number | null = null;
			let expectedText: number | null = null;
			let animation = 0;
			const points = () =>
				Array.from(
					text.querySelectorAll<HTMLElement>("[data-zoro-page]"),
				).flatMap((element) => {
					const page = pdf.querySelector<HTMLElement>(
						`.page[data-page-number="${element.dataset.zoroPage}"]`,
					);
					if (!page) return [];
					const pdfTop =
						page.getBoundingClientRect().top -
						pdf.getBoundingClientRect().top +
						pdf.scrollTop;
					return [{ pdf: pdfTop, text: element.offsetTop }];
				});
			const handleScroll = (direction: "pdf" | "text") => {
				const source = direction === "pdf" ? pdf : text;
				const expected = direction === "pdf" ? expectedPdf : expectedText;
				if (expected !== null && Math.abs(source.scrollTop - expected) < 1)
					return;
				if (direction === "pdf") expectedPdf = null;
				else expectedText = null;
				cancelAnimationFrame(animation);
				animation = requestAnimationFrame(() => {
					const offset = mapTranslationOffset(
						points(),
						source.scrollTop,
						direction,
					);
					if (offset === null) return;
					const target = direction === "pdf" ? text : pdf;
					target.scrollTop = offset;
					if (direction === "pdf") expectedText = target.scrollTop;
					else expectedPdf = target.scrollTop;
				});
			};
			const fromPdf = () => handleScroll("pdf");
			const fromText = () => handleScroll("text");
			pdf.addEventListener("scroll", fromPdf, { passive: true });
			text.addEventListener("scroll", fromText, { passive: true });
			cleanup = () => {
				pdf.removeEventListener("scroll", fromPdf);
				text.removeEventListener("scroll", fromText);
				cancelAnimationFrame(animation);
			};
			fromPdf();
			return true;
		};
		const timer = setInterval(() => {
			if (attach()) clearInterval(timer);
		}, 250);
		if (attach()) clearInterval(timer);
		return () => {
			clearInterval(timer);
			cleanup?.();
		};
	}, [sync, anchored, isActive]);

	useEffect(() => {
		const root = textRef.current;
		if (!root) return;
		for (const mark of root.querySelectorAll("mark[data-search]"))
			mark.replaceWith(...mark.childNodes);
		root.normalize();
		const matches: HTMLElement[] = [];
		if (query.trim()) {
			const walker = window.document.createTreeWalker(
				root,
				NodeFilter.SHOW_TEXT,
			);
			const nodes: Text[] = [];
			while (walker.nextNode()) nodes.push(walker.currentNode as Text);
			for (const node of nodes) {
				if (node.parentElement?.closest(".katex, button")) continue;
				const value = node.data;
				const lowered = value.toLocaleLowerCase();
				const needle = query.toLocaleLowerCase();
				let start = 0;
				let index = lowered.indexOf(needle);
				if (index < 0) continue;
				const fragment = window.document.createDocumentFragment();
				while (index >= 0) {
					fragment.append(value.slice(start, index));
					const mark = window.document.createElement("mark");
					mark.dataset.search = "true";
					mark.className = "bg-yellow-300 text-black";
					mark.textContent = value.slice(index, index + needle.length);
					fragment.append(mark);
					matches.push(mark);
					start = index + needle.length;
					index = lowered.indexOf(needle, start);
				}
				fragment.append(value.slice(start));
				node.replaceWith(fragment);
			}
		}
		setMatchCount(matches.length);
		const match = matches[matchIndex % Math.max(matches.length, 1)];
		if (match)
			root.scrollTop +=
				match.getBoundingClientRect().top -
				root.getBoundingClientRect().top -
				24;
		return () => {
			for (const mark of matches)
				if (mark.parentNode) mark.replaceWith(...mark.childNodes);
			root.normalize();
		};
	}, [query, matchIndex]);

	return (
		<div ref={rootRef} className="h-full w-full">
			<ResizablePanelGroup
				orientation="horizontal"
				autoSaveId="offline-bilingual-layout"
			>
				<ResizablePanel id="original" defaultSize="50%" minSize="20%">
					<div data-original className="h-full">
						<PdfAnnotationViewer
							paperId={paperId}
							pdfFilename={pdfFilename}
							isActive={isActive}
						/>
					</div>
				</ResizablePanel>
				<ResizableHandle withHandle />
				<ResizablePanel id="translation" defaultSize="50%" minSize="20%">
					<div className="flex h-full min-w-0 flex-col bg-background text-foreground">
						<div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs">
							<label className="flex items-center gap-1">
								<input
									type="checkbox"
									checked={sync}
									disabled={!anchored}
									onChange={(event) => setSync(event.target.checked)}
								/>
								{t("offline.sync")}
							</label>
							<span className="text-muted-foreground">
								{t(anchored ? "offline.anchored" : "offline.unanchored")}
							</span>
							<label>
								{t("offline.font")}{" "}
								<input
									aria-label={t("offline.font")}
									className="w-12 rounded border bg-background text-foreground"
									type="number"
									min={12}
									max={32}
									value={fontSize}
									onChange={(event) =>
										setFontSize(
											Math.min(
												32,
												Math.max(12, Number(event.target.value) || 17),
											),
										)
									}
								/>
							</label>
							<Button
								size="sm"
								variant="ghost"
								disabled={
									!sections.some((section) => section.page === currentPage)
								}
								onClick={() => handleJump(currentPage)}
							>
								{t("offline.toTranslation", { page: currentPage })}
							</Button>
							{anchored && (
								<form
									onSubmit={(event) => {
										event.preventDefault();
										handleJump(Number(pageInput));
									}}
								>
									<select
										aria-label={t("offline.page")}
										className="rounded border bg-background text-foreground"
										value={pageInput}
										onChange={(event) => {
											setPageInput(event.target.value);
											handleJump(Number(event.target.value));
										}}
									>
										<option value="">{t("offline.page")}</option>
										{sections
											.filter((section) => section.page !== null)
											.map((section) => (
												<option key={section.page} value={section.page ?? ""}>
													{section.page}
												</option>
											))}
									</select>
								</form>
							)}
						</div>
						<div className="flex items-center gap-2 border-b px-3 py-1 text-xs">
							<input
								className="min-w-0 flex-1 rounded border bg-background px-2 py-1 text-foreground"
								aria-label={t("offline.search")}
								placeholder={t("offline.search")}
								value={query}
								onChange={(event) => {
									setQuery(event.target.value);
									setMatchIndex(0);
								}}
								onKeyDown={(event) => {
									if (event.key === "Enter")
										setMatchIndex((value) => value + 1);
								}}
							/>
							<span aria-live="polite">
								{matchCount ? (matchIndex % matchCount) + 1 : 0}/{matchCount}
							</span>
							<Button
								size="sm"
								variant="ghost"
								disabled={!matchCount}
								onClick={() =>
									setMatchIndex(
										(value) => (value + matchCount - 1) % matchCount,
									)
								}
							>
								{t("offline.previous")}
							</Button>
							<Button
								size="sm"
								variant="ghost"
								disabled={!matchCount}
								onClick={() => setMatchIndex((value) => value + 1)}
							>
								{t("offline.next")}
							</Button>
						</div>
						<div
							ref={textRef}
							className="relative min-h-0 flex-1 overflow-auto px-6 py-4"
							style={{ fontSize }}
						>
							{sections.map((section, index) => (
								<section
									key={section.page ?? `intro-${index}`}
									data-zoro-page={section.page ?? undefined}
								>
									{section.page !== null && (
										<Button
											size="sm"
											variant="ghost"
											disabled={section.page > totalPages}
											onClick={() => {
												if (section.page !== null) navigateToPage(section.page);
											}}
										>
											{t("offline.toOriginal", { page: section.page })}
										</Button>
									)}
									{document.format === "txt" ? (
										<div className="whitespace-pre-wrap break-words leading-relaxed">
											{section.text}
										</div>
									) : (
										<article className="prose prose-slate max-w-none break-words text-[1em] dark:prose-invert prose-headings:leading-snug prose-table:block prose-table:overflow-x-auto">
											<TranslationMarkdown text={section.text} />
										</article>
									)}
								</section>
							))}
						</div>
					</div>
				</ResizablePanel>
			</ResizablePanelGroup>
		</div>
	);
}
