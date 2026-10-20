import { Button } from "@/components/ui/button";
import * as commands from "@/lib/commands";
import { decodeTranslation } from "@/lib/offlineTranslation";
import {
	offlineTranslationKey,
	useOfflineTranslationStore,
} from "@/stores/offlineTranslationStore";
import { useTabStore } from "@/stores/tabStore";
import { confirm, open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const EMPTY: commands.OfflineTranslation[] = [];

export function OfflineTranslationToolbar({
	tabId,
	paperId,
	sourcePdf,
	onOpen,
}: { tabId: string; paperId: string; sourcePdf: string; onOpen: () => void }) {
	const { t } = useTranslation();
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [loadedKey, setLoadedKey] = useState("");
	const storageKey = `zoro-offline-selection:${offlineTranslationKey(paperId, sourcePdf)}`;
	const load = useOfflineTranslationStore((s) => s.load);
	const documents = useOfflineTranslationStore(
		(s) => s.documents[offlineTranslationKey(paperId, sourcePdf)] ?? EMPTY,
	);
	const selected = useTabStore(
		(s) => s.tabs.find((tab) => tab.id === tabId)?.offlineTranslationId,
	);
	const updateTab = useTabStore((s) => s.updateTab);

	useEffect(() => {
		let cancelled = false;
		setError("");
		load(paperId, sourcePdf)
			.then(() => {
				if (cancelled) return;
				const tab = useTabStore
					.getState()
					.tabs.find((entry) => entry.id === tabId);
				const saved = localStorage.getItem(storageKey);
				const available =
					useOfflineTranslationStore.getState().documents[
						offlineTranslationKey(paperId, sourcePdf)
					];
				if (
					!tab?.bilingualMode &&
					!tab?.offlineTranslationId &&
					saved &&
					available?.some((entry) => entry.id === saved)
				) {
					updateTab(tabId, { offlineTranslationId: saved });
					onOpen();
				}
				setLoadedKey(storageKey);
			})
			.catch((reason) => {
				if (!cancelled) setError(String(reason));
			});
		return () => {
			cancelled = true;
		};
	}, [paperId, sourcePdf, load, storageKey, tabId, updateTab, onOpen]);

	useEffect(() => {
		if (loadedKey === storageKey)
			localStorage.setItem(storageKey, selected ?? "");
	}, [loadedKey, storageKey, selected]);

	const handleImport = async () => {
		setBusy(true);
		setError("");
		try {
			const path = await open({
				multiple: false,
				directory: false,
				filters: [{ name: t("offline.documents"), extensions: ["md", "txt"] }],
			});
			if (!path) return;
			const name = path.split(/[\\/]/).pop() ?? "";
			if (!/\.(md|txt)$/i.test(name)) throw new Error(t("offline.invalidFile"));
			let content: string;
			try {
				content = decodeTranslation(await readFile(path));
			} catch {
				throw new Error(t("offline.invalidFile"));
			}
			const document = await commands.importOfflineTranslation(
				paperId,
				sourcePdf,
				name,
				content,
			);
			await load(paperId, sourcePdf);
			updateTab(tabId, {
				offlineTranslationId: document.id,
				bilingualMode: false,
			});
			onOpen();
		} catch (reason) {
			setError(String(reason));
		} finally {
			setBusy(false);
		}
	};

	const handleDelete = async () => {
		if (
			!selected ||
			!(await confirm(t("offline.confirmDelete"), { kind: "warning" }))
		)
			return;
		setBusy(true);
		setError("");
		try {
			await commands.deleteOfflineTranslation(paperId, selected);
			await load(paperId, sourcePdf);
			for (const tab of useTabStore.getState().tabs) {
				if (tab.paperId === paperId && tab.offlineTranslationId === selected)
					updateTab(tab.id, { offlineTranslationId: undefined });
			}
		} catch (reason) {
			setError(String(reason));
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="flex flex-wrap items-center gap-2 border-b bg-background px-3 py-1 text-xs">
			<Button size="sm" variant="ghost" disabled={busy} onClick={handleImport}>
				{t("offline.import")}
			</Button>
			{documents.length > 0 && (
				<>
					<select
						className="max-w-64 rounded border bg-background p-1 text-foreground"
						aria-label={t("offline.versions")}
						disabled={busy}
						value={selected ?? ""}
						onChange={(event) => {
							updateTab(tabId, {
								offlineTranslationId: event.target.value || undefined,
								bilingualMode: false,
							});
							if (event.target.value) onOpen();
						}}
					>
						<option value="">{t("offline.original")}</option>
						{documents.map((document) => (
							<option key={document.id} value={document.id}>
								{document.name} ·{" "}
								{new Date(document.createdAt).toLocaleString()}
							</option>
						))}
					</select>
					<Button
						size="sm"
						variant="ghost"
						disabled={!selected || busy}
						onClick={handleDelete}
					>
						{t("offline.delete")}
					</Button>
				</>
			)}
			<span className="text-muted-foreground">{t("offline.local")}</span>
			{error && (
				<span role="alert" className="text-destructive">
					{t("offline.error", { error })}
				</span>
			)}
		</div>
	);
}
