import * as commands from "@/lib/commands";
import type { OfflineTranslation } from "@/lib/commands";
import { create } from "zustand";

interface OfflineTranslationState {
	documents: Record<string, OfflineTranslation[]>;
	load: (paperId: string, sourcePdf: string) => Promise<void>;
}

export const offlineTranslationKey = (paperId: string, sourcePdf: string) =>
	JSON.stringify([paperId, sourcePdf]);

export const useOfflineTranslationStore = create<OfflineTranslationState>(
	(set) => ({
		documents: {},
		load: async (paperId, sourcePdf) => {
			const documents = await commands.listOfflineTranslations(
				paperId,
				sourcePdf,
			);
			set((state) => ({
				documents: {
					...state.documents,
					[offlineTranslationKey(paperId, sourcePdf)]: documents,
				},
			}));
		},
	}),
);
