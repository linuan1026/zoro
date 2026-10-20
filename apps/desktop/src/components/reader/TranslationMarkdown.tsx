import { memo } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import {
	type SentencePair,
	rehypeSentenceAlignment,
} from "../../lib/sentenceAlignment";
import {
	rehypeTranslationSearch,
	safeTranslationUrl,
	searchParts,
} from "../../lib/translationContent";

const markdownSchema = {
	...defaultSchema,
	attributes: {
		...defaultSchema.attributes,
		code: [["className", /^language-./, "math-inline", "math-display"]],
	},
};

export const TranslationMarkdown = memo(function TranslationMarkdown({
	text,
	query = "",
	onOpenLink,
	pairs = [],
	section = null,
	activeId = null,
}: {
	text: string;
	query?: string;
	onOpenLink?: (url: string) => void;
	pairs?: SentencePair[];
	section?: number | null;
	activeId?: string | null;
}) {
	const { t } = useTranslation();
	return (
		<ReactMarkdown
			remarkPlugins={[remarkGfm, remarkMath]}
			rehypePlugins={[
				rehypeRaw,
				[rehypeSanitize, markdownSchema],
				[rehypeKatex, { trust: false, strict: "ignore" }],
				[rehypeTranslationSearch, { query }],
				[rehypeSentenceAlignment, { pairs, section, activeId }],
			]}
			components={{
				img: ({ alt }) => (
					<span className="block rounded border p-2 text-sm text-muted-foreground">
						{t("offline.imageBlocked", { alt: alt ?? "" })}
					</span>
				),
				a: ({ children, href }) => {
					const url = safeTranslationUrl(href);
					return url ? (
						<button
							type="button"
							title={t("offline.externalLink", { url })}
							className="cursor-pointer text-primary underline"
							onClick={() => onOpenLink?.(url)}
						>
							{children} ↗
						</button>
					) : (
						<span>{children}</span>
					);
				},
			}}
		>
			{text}
		</ReactMarkdown>
	);
});

export function TranslationPlainText({
	text,
	query,
}: { text: string; query: string }) {
	return (
		<div className="whitespace-pre-wrap break-words leading-relaxed">
			{searchParts(text, query).map((part, index) =>
				part.match ? (
					<mark
						key={`${index}-${part.text}`}
						data-search
						className="bg-yellow-300 text-black"
					>
						{part.text}
					</mark>
				) : (
					part.text
				),
			)}
		</div>
	);
}
