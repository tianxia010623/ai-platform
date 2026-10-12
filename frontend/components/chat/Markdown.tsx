"use client";

import { memo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CheckIcon, CopyIcon } from "@/components/icons";

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function CodeBlock({ children, language }: { children: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group/code relative my-2 overflow-hidden rounded-xl border border-line bg-paper">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="font-mono text-[11px] text-ink-muted">{language || "code"}</span>
        <button
          type="button"
          onClick={async () => {
            if (await copyText(children)) {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }
          }}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-ink-muted hover:text-ink"
          aria-label="Copy code"
        >
          {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-2.5 text-ink">
        <code>{children}</code>
      </pre>
    </div>
  );
}

const components: Components = {
  // Fenced code goes through CodeBlock; inline `code` keeps the default
  // element (styled in globals.css).
  pre({ children }) {
    return <>{children}</>;
  },
  code({ className, children }) {
    const text = String(children ?? "");
    const language = /language-([\w-]+)/.exec(className ?? "")?.[1];
    const isBlock = Boolean(language) || text.includes("\n");
    if (!isBlock) return <code>{children}</code>;
    return <CodeBlock language={language}>{text.replace(/\n$/, "")}</CodeBlock>;
  },
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
};

/** Assistant replies rendered as GitHub-flavored Markdown. Raw HTML in the
 * text is not rendered (react-markdown escapes it by default). */
function Markdown({ text }: { text: string }) {
  return (
    <div className="prose-chat">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

export default memo(Markdown);
