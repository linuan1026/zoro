import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "katex/dist/katex.min.css";
import { Button } from "@/components/ui/button";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import type { OfflineTranslation } from "@/lib/commands";
import * as commands from "@/lib/commands";
import { splitTranslation } from "@/lib/offlineTranslation";
import { readAlignedDocument } from "@/lib/sentenceAlignment";
import { bindTranslationScroll } from "@/lib/translationScroll";
import { useAnnotationStore } from "@/stores/annotationStore";
import { AlignmentDiagnostics } from "./AlignmentDiagnostics";
import { PdfAnnotationViewer } from "./PdfAnnotationViewer";
import {
	TranslationMarkdown,
	TranslationPlainText,
} from "./TranslationMarkdown";
import { useSentenceAlignment } from "./useSentenceAlignment";

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
	const handleOpenLink = useCallback(
		(url: string) => {
			void commands
				.openOfflineTranslationLink(url, t("offline.confirmExternal", { url }))
				.catch((error) =>
					window.alert(t("offline.error", { error: String(error) })),
				);
		},
		[t],
	);
	const rootRef = useRef<HTMLDivElement>(null);
	const textRef = useRef<HTMLDivElement>(null);
	const aligned = useMemo(
		() => readAlignedDocument(document.content),
		[document.content],
	);
	const [sentenceEnabled, setSentenceEnabled] = useState(true);
	const [diagnosticsEnabled, setDiagnosticsEnabled] = useState(false);
	const suppliedPages = useMemo(
		() =>
			[
				...new Set(
					aligned.pairs.flatMap((pair) =>
						pair.source.map((quote) => quote.page),
					),
				),
			].sort((left, right) => left - right),
		[aligned.pairs],
	);
	const [autoFollow, setAutoFollow] = useState(false);
	const [hoverId, setHoverId] = useState<string | null>(null);
	const [pinnedId, setPinnedId] = useState<string | null>(null);
	const activeId = sentenceEnabled ? (hoverId ?? pinnedId) : null;
	const handlePin = useCallback(
		(id: string | null) =>
			setPinnedId((previous) => (previous === id ? null : id)),
		[],
	);
	const boxes = useSentenceAlignment({
		rootRef,
		textRef,
		pairs: aligned.pairs,
		enabled: sentenceEnabled,
		isActive,
		activeId,
		onHover: setHoverId,
		onPin: handlePin,
	});
	useEffect(() => {
		if (!activeId || !autoFollow || !isActive) return;
		const text = textRef.current;
		const target = text?.querySelector<HTMLElement>(
			`[data-alignment="${activeId}"]`,
		);
		if (text && target)
			text.scrollTop +=
				target.getBoundingClientRect().top -
				text.getBoundingClientRect().top -
				40;
	}, [activeId, autoFollow, isActive]);
	const sections = useMemo(
		() => splitTranslation(aligned.markdown),
		[aligned.markdown],
	);
	const totalPages = useAnnotationStore((s) => s.totalPages);
	const anchored = sections.some(
		(section) => section.page !== null && section.page <= totalPages,
	);
	const [precision, setPrecision] = useState<
		"exact" | "approximate" | "unmapped"
	>("unmapped");
	const [sync, setSync] = useState(false);
	const [fontSize, setFontSize] = useState(17);
	const [query, setQuery] = useState("");
	const [matchIndex, setMatchIndex] = useState(0);
	const [matchCount, setMatchCount] = useState(0);
	const [pageInput, setPageInput] = useState("");
	const currentPage = useAnnotationStore((s) => s.currentPage);
	const navigateToPage = useAnnotationStore((s) => s.navigateToPage);

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
			const points = () =>
				sections.flatMap((section) => {
					if (section.page === null) return [];
					const element = text.querySelector<HTMLElement>(
						`[data-zoro-page="${section.page}"]`,
					);
					if (!element) return [];
					const page = pdf.querySelector<HTMLElement>(
						`.page[data-page-number="${element.dataset.zoroPage}"]`,
					);
					if (!page) return [];
					return [
						{
							pdf:
								page.getBoundingClientRect().top -
								pdf.getBoundingClientRect().top +
								pdf.scrollTop,
							text:
								element.getBoundingClientRect().top -
								text.getBoundingClientRect().top +
								text.scrollTop,
						},
					];
				});
			const binding = bindTranslationScroll(pdf, text, points, setPrecision);
			const resize = new ResizeObserver(binding.refresh);
			const observeSizes = () => {
				resize.disconnect();
				resize.observe(pdf);
				resize.observe(text);
				for (const element of root.querySelectorAll(
					".page, [data-zoro-page], article",
				))
					resize.observe(element);
			};
			const mutation = new MutationObserver(() => {
				observeSizes();
				binding.refresh();
			});
			mutation.observe(root, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: ["style", "class"],
			});
			observeSizes();
			window.addEventListener("resize", binding.refresh);
			cleanup = () => {
				binding.dispose();
				resize.disconnect();
				mutation.disconnect();
				window.removeEventListener("resize", binding.refresh);
			};
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
	}, [sync, anchored, isActive, sections]);

	useEffect(() => {
		const root = textRef.current;
		if (!root) return;
		const matches = query.trim()
			? root.querySelectorAll<HTMLElement>("mark[data-search]")
			: [];
		setMatchCount(matches.length);
		const match = matches[matchIndex % Math.max(matches.length, 1)];
		if (match && isActive)
			root.scrollTop +=
				match.getBoundingClientRect().top -
				root.getBoundingClientRect().top -
				24;
	}, [query, matchIndex, isActive]);

	return (
		<div
			ref={rootRef}
			data-total-pdf-pages={totalPages}
			className="relative h-full w-full overflow-hidden"
		>
			{sentenceEnabled &&
				isActive &&
				boxes.map((box, index) => (
					<div
						key={`${index}-${box.left}-${box.top}`}
						aria-hidden
						className="pointer-events-none absolute z-20 rounded-sm bg-yellow-300/35 dark:bg-yellow-400/25"
						style={box}
					/>
				))}
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
							<label>
								<input
									type="checkbox"
									checked={diagnosticsEnabled}
									onChange={(event) =>
										setDiagnosticsEnabled(event.target.checked)
									}
								/>{" "}
								{t("alignmentDiagnostics.toggle")}
							</label>
							{aligned.pairs.length > 0 && (
								<>
									<span className="text-muted-foreground">
										{t("alignmentDiagnostics.summary", {
											groups: aligned.pairs.length,
											pages: suppliedPages.join(", "),
										})}
									</span>
									<label>
										<input
											type="checkbox"
											checked={sentenceEnabled}
											onChange={(event) => {
												setSentenceEnabled(event.target.checked);
												setHoverId(null);
												setPinnedId(null);
											}}
										/>{" "}
										{t("offline.sentenceAlignment")}
									</label>
									<label>
										<input
											type="checkbox"
											checked={autoFollow}
											onChange={(event) => setAutoFollow(event.target.checked)}
										/>{" "}
										{t("offline.autoFollow")}
									</label>
									<Button
										size="sm"
										variant="ghost"
										disabled={!pinnedId}
										onClick={() => {
											setPinnedId(null);
											setHoverId(null);
										}}
									>
										{t("offline.unpin")}
									</Button>
									<span className="text-muted-foreground">
										{t("offline.alignmentHint")}
										{pinnedId ? ` · ${t("offline.pinned")}` : ""}
									</span>
								</>
							)}
							{aligned.invalid && (
								<span role="alert">{t("offline.alignmentInvalid")}</span>
							)}
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
								{t(
									!anchored
										? "offline.unanchored"
										: !sync
											? "offline.anchored"
											: `offline.${precision}`,
								)}
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
						{diagnosticsEnabled && (
							<AlignmentDiagnostics
								rootRef={rootRef}
								textRef={textRef}
								pairs={aligned.pairs}
								currentPage={currentPage}
								hoverId={hoverId}
								isActive={isActive}
							/>
						)}
						<div className="flex items-center gap-2 border-b px-3 py-1 text-xs">
							<input
								className="min-w-0 flex-1 rounded border bg-background px-2 py-1 text-foreground"
								aria-label={t("offline.search")}
								placeholder={t("offline.search")}
								title={t("offline.searchScope")}
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
										<TranslationPlainText text={section.text} query={query} />
									) : (
										<article className="prose prose-slate max-w-none break-words text-[1em] dark:prose-invert prose-headings:leading-snug prose-table:block prose-table:overflow-x-auto">
											<TranslationMarkdown
												text={section.text}
												pairs={aligned.pairs}
												section={section.page}
												activeId={activeId}
												query={query}
												onOpenLink={handleOpenLink}
											/>
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
