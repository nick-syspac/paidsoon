import type { HTMLAttributes, ReactNode } from "react"

function cx(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ")
}

export const helpMdxComponents = {
  h2: (props: HTMLAttributes<HTMLHeadingElement>) => (
    <h2 {...props} className={cx("text-xl font-semibold text-gray-900 mt-10 mb-3", props.className)} />
  ),
  h3: (props: HTMLAttributes<HTMLHeadingElement>) => (
    <h3 {...props} className={cx("text-lg font-medium text-gray-900 mt-8 mb-2", props.className)} />
  ),
  p: (props: HTMLAttributes<HTMLParagraphElement>) => (
    <p {...props} className={cx("text-sm text-gray-600 leading-6 mb-4", props.className)} />
  ),
  ul: (props: HTMLAttributes<HTMLUListElement>) => (
    <ul {...props} className={cx("list-disc pl-5 text-sm text-gray-600 space-y-1 mb-4", props.className)} />
  ),
  ol: (props: HTMLAttributes<HTMLOListElement>) => (
    <ol {...props} className={cx("list-decimal pl-5 text-sm text-gray-600 space-y-2 mb-4", props.className)} />
  ),
  li: (props: HTMLAttributes<HTMLLIElement>) => <li {...props} />,
  a: (props: HTMLAttributes<HTMLAnchorElement>) => (
    <a {...props} className={cx("text-blue-600 hover:underline", props.className)} />
  ),
  code: (props: HTMLAttributes<HTMLElement>) => (
    <code {...props} className={cx("bg-gray-100 rounded px-1 py-0.5 text-xs font-mono", props.className)} />
  ),
  pre: (props: HTMLAttributes<HTMLPreElement>) => (
    <pre {...props} className={cx("bg-gray-900 text-gray-100 rounded-lg p-4 text-xs overflow-x-auto mb-4", props.className)} />
  ),
  Callout: ({ title, children }: { title?: string; children: ReactNode }) => (
    <div className="border-l-4 border-blue-200 bg-blue-50 rounded-r-lg px-4 py-3 mb-4">
      {title ? <p className="text-sm font-medium text-blue-900 mb-1">{title}</p> : null}
      <div className="text-sm text-blue-800">{children}</div>
    </div>
  ),
}
