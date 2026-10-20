export function normalizeUiLanguage(value: string): string {
	if (/^zh(?:[-_](?:tw|hk|mo|hant))(?:[-_]|$)/i.test(value)) return "zh-TW";
	if (/^zh(?:[-_]|$)/i.test(value)) return "zh-CN";
	return value.split(/[-_]/)[0].toLowerCase();
}

export function initialOnboardingVisibility(): boolean {
	return false;
}
