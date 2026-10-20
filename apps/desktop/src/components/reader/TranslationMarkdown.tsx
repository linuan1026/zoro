import { memo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

const markdownSchema = {
	...defaultSchema,
	attributes: {
		...defaultSchema.attributes,
		code: [["className", /^language-./, "math-inline", "math-display"]],
	},
};

export const TranslationMarkdown = memo(function TranslationMarkdown({
	text,
}: { text: string }) {
	return (
		<ReactMarkdown
			remarkPlugins={[remarkGfm, remarkMath]}
			rehypePlugins={[
				rehypeRaw,
				[rehypeSanitize, markdownSchema],
				[rehypeKatex, { trust: false, strict: "ignore" }],
			]}
			components={{
				img: () => null,
				a: ({ children }) => <span>{children}</span>,
			}}
		>
			{text}
		</ReactMarkdown>
	);
});
