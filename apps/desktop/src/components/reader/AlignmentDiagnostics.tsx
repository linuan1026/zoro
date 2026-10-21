import { Button } from "@/components/ui/button";
import {
	type AlignmentReport,
	alignmentCoverage,
	diagnosticExport,
} from "@/lib/alignmentDiagnostics";
import * as commands from "@/lib/commands";
import type { SentencePair } from "@/lib/sentenceAlignment";
import { type RefObject, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export function AlignmentDiagnostics({
	rootRef,
	textRef,
	pairs,
	currentPage,
	hoverId,
	isActive,
}: {
	rootRef: RefObject<HTMLDivElement | null>;
	textRef: RefObject<HTMLDivElement | null>;
	pairs: SentencePair[];
	currentPage: number;
	hoverId: string | null;
	isActive: boolean;
}) {
	const { t } = useTranslation();
	const statusLabel = (status: string) =>
		t(
			status === "partial-conflict"
				? "alignmentDiagnostics.partial"
				: `alignmentDiagnostics.status.${status}`,
		);
	const [report, setReport] = useState<AlignmentReport | null>(null);
	const [inspectedId, setInspectedId] = useState("");
	const [error, setError] = useState("");
	const update = useCallback(() => {
		const root = rootRef.current;
		const text = textRef.current;
		if (!root || !text || !isActive) return;
		const next = alignmentCoverage(
			root,
			text,
			pairs,
			Number(root.dataset.totalPdfPages) || 0,
		);
		setReport((previous) =>
			JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
		);
	}, [rootRef, textRef, pairs, isActive]);
	useEffect(() => {
		if (!isActive) return;
		update();
		const timer = setInterval(update, 2000);
		return () => clearInterval(timer);
	}, [isActive, update]);
	const selectedId = inspectedId || hoverId || "";
	const rows =
		report?.entries.filter((entry) =>
			selectedId
				? entry.id === selectedId
				: entry.source.some((quote) => quote.page === currentPage),
		) ?? [];
	const exportReport = async () => {
		if (!report) return;
		try {
			await commands.exportAlignmentDiagnostics(
				JSON.stringify(
					diagnosticExport(report, currentPage, selectedId),
					null,
					2,
				),
			);
			setError("");
		} catch (reason) {
			setError(String(reason));
		}
	};
	return (
		<div
			className="max-h-64 shrink-0 space-y-1 overflow-auto border-b bg-background px-3 py-2 text-xs"
			data-diagnostic-panel
		>
			<div className="flex flex-wrap items-center gap-2">
				<strong>{t("alignmentDiagnostics.page", { page: currentPage })}</strong>
				<Button size="sm" variant="ghost" onClick={update}>
					{t("alignmentDiagnostics.refresh")}
				</Button>
				<Button
					size="sm"
					variant="ghost"
					disabled={!report}
					onClick={() => void exportReport()}
				>
					{t("alignmentDiagnostics.export")}
				</Button>
			</div>
			<p>
				{t("alignmentDiagnostics.summary", {
					groups: report?.importedGroups ?? pairs.length,
					pages:
						report?.suppliedPages.join(", ") || t("alignmentDiagnostics.none"),
				})}
			</p>
			<p>
				{t("alignmentDiagnostics.missingPages", {
					pages:
						report?.pagesWithoutEntries.join(", ") ||
						t("alignmentDiagnostics.none"),
				})}
			</p>
			<p className="text-muted-foreground">
				{t("alignmentDiagnostics.completeness")}
			</p>
			<label>
				{t("alignmentDiagnostics.inspect")}{" "}
				<input
					className="rounded border bg-background text-foreground"
					maxLength={80}
					value={inspectedId}
					onChange={(event) =>
						setInspectedId(event.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))
					}
				/>
			</label>
			<p>
				{selectedId
					? `${selectedId}: ${t(report?.entries.some((entry) => entry.id === selectedId) ? "alignmentDiagnostics.presentId" : "alignmentDiagnostics.missingId")}`
					: t("alignmentDiagnostics.noHover")}
			</p>
			{report?.pageCoverage
				.filter((page) => page.page === currentPage)
				.map((page) => (
					<p key={page.page}>
						{t("alignmentDiagnostics.coverage", {
							page: page.page,
							groups: page.groups,
							uncovered: page.uncoveredFragments,
							fraction:
								page.matchedTextFraction === null
									? "—"
									: `${(page.matchedTextFraction * 100).toFixed(1)}%`,
						})}
					</p>
				))}
			{rows.map((entry) => (
				<div className="rounded border p-1" key={entry.id}>
					<strong>{entry.id}</strong>
					{entry.source.map((quote, index) => (
						<p key={`source-${index}-${quote.page}`}>
							{t("alignmentDiagnostics.source")} · {quote.page} ·{" "}
							{statusLabel(quote.status)} ·{" "}
							{t("alignmentDiagnostics.layer", {
								loaded: quote.textLayerLoaded ? "✓" : "—",
							})}{" "}
							·{" "}
							{t("alignmentDiagnostics.count", {
								fragments: quote.fragments,
								lines: quote.lines,
								matches: quote.matchCount,
							})}{" "}
							· {t(`alignmentDiagnostics.status.${quote.completeness}`)}
						</p>
					))}
					{entry.target.map((quote, index) => (
						<p key={`target-${index}-${quote.section}`}>
							{t("alignmentDiagnostics.target")} · {quote.section ?? "—"} ·{" "}
							{statusLabel(quote.status)} · {quote.matchCount} ·{" "}
							{t(`alignmentDiagnostics.status.${quote.completeness}`)}
						</p>
					))}
				</div>
			))}
			<p className="text-muted-foreground">
				{t("alignmentDiagnostics.selection")}{" "}
				{t("alignmentDiagnostics.privacy")}
			</p>
			{error && (
				<p role="alert">{t("alignmentDiagnostics.error", { error })}</p>
			)}
		</div>
	);
}
