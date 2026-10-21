// Copyright (c) 2026 Ruihang Li and the Zoro Team
// Licensed under the AGPL-3.0 license.
// See LICENSE file in the project root for full license information.

import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import {
	diagnosticEnglish,
	diagnosticTraditionalChinese,
} from "@/locales/alignmentDiagnostics";
import de from "@/locales/de.json";
import en from "@/locales/en.json";
import es from "@/locales/es.json";
import fr from "@/locales/fr.json";
import ja from "@/locales/ja.json";
import ko from "@/locales/ko.json";
import { offlineEnglish, offlineTraditionalChinese } from "@/locales/offline";
import pt from "@/locales/pt.json";
import ru from "@/locales/ru.json";
import zhCN from "@/locales/zh-CN.json";
import zhTW from "@/locales/zh-TW.json";
import { normalizeUiLanguage } from "./uiPreferences";

export const supportedLanguages = [
	{ code: "en", label: "English" },
	{ code: "zh-TW", label: "繁體中文" },
	{ code: "zh-CN", label: "简体中文" },
	{ code: "ja", label: "日本語" },
	{ code: "ko", label: "한국어" },
	{ code: "es", label: "Español" },
	{ code: "fr", label: "Français" },
	{ code: "de", label: "Deutsch" },
	{ code: "pt", label: "Português" },
	{ code: "ru", label: "Русский" },
] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number]["code"];

i18n
	.use(LanguageDetector)
	.use(initReactI18next)
	.init({
		resources: {
			en: {
				translation: {
					...en,
					alignmentDiagnostics: diagnosticEnglish,
					offline: offlineEnglish,
				},
			},
			"zh-TW": {
				translation: {
					...zhTW,
					alignmentDiagnostics: diagnosticTraditionalChinese,
					offline: offlineTraditionalChinese,
				},
			},
			"zh-CN": {
				translation: {
					...zhCN,
					alignmentDiagnostics: diagnosticTraditionalChinese,
					offline: offlineTraditionalChinese,
				},
			},
			ja: {
				translation: {
					...ja,
					alignmentDiagnostics: diagnosticEnglish,
					offline: offlineEnglish,
				},
			},
			ko: {
				translation: {
					...ko,
					alignmentDiagnostics: diagnosticEnglish,
					offline: offlineEnglish,
				},
			},
			es: {
				translation: {
					...es,
					alignmentDiagnostics: diagnosticEnglish,
					offline: offlineEnglish,
				},
			},
			fr: {
				translation: {
					...fr,
					alignmentDiagnostics: diagnosticEnglish,
					offline: offlineEnglish,
				},
			},
			de: {
				translation: {
					...de,
					alignmentDiagnostics: diagnosticEnglish,
					offline: offlineEnglish,
				},
			},
			pt: {
				translation: {
					...pt,
					alignmentDiagnostics: diagnosticEnglish,
					offline: offlineEnglish,
				},
			},
			ru: {
				translation: {
					...ru,
					alignmentDiagnostics: diagnosticEnglish,
					offline: offlineEnglish,
				},
			},
		},
		fallbackLng: "en",
		interpolation: {
			escapeValue: false, // React already escapes
		},
		detection: {
			convertDetectedLanguage: normalizeUiLanguage,
			order: ["localStorage", "navigator"],
			lookupLocalStorage: "zoro-ui-language",
			caches: ["localStorage"],
		},
	});

export default i18n;
