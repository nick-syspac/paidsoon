"use client"

import { useEditor, EditorContent, Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Underline from "@tiptap/extension-underline"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import { Node, mergeAttributes } from "@tiptap/core"
import { useState, useCallback, forwardRef, useImperativeHandle } from "react"

// ---------------------------------------------------------------------------
// Variable token definitions
// ---------------------------------------------------------------------------

export interface TemplateVariable {
  token: string       // e.g. "clientName"
  label: string       // e.g. "Client name"
  description?: string
  stage3Only?: boolean
}

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  { token: "clientName", label: "Client name", description: "e.g. Jane Smith" },
  { token: "invoiceRef", label: "Invoice reference", description: "e.g. INV-0042" },
  { token: "amountDue", label: "Amount due", description: "e.g. £1,250.00" },
  { token: "dueDate", label: "Due date", description: "e.g. 15 June 2026" },
  { token: "paymentLink", label: "Payment link", description: "Stripe-hosted payment URL" },
  { token: "yourName", label: "Your name", description: "your display name" },
  { token: "daysOverdue", label: "Days overdue", description: "e.g. 12", stage3Only: true },
  { token: "firmDeadline", label: "Firm deadline", description: "e.g. 30 June 2026", stage3Only: true },
]

// ---------------------------------------------------------------------------
// Variable chip — custom TipTap inline node that renders {{token}} as a chip
// ---------------------------------------------------------------------------

const VariableChip = Node.create({
  name: "variableChip",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      token: { default: null },
      label: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-variable]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-variable": HTMLAttributes.token,
        class:
          "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 mx-0.5 select-none cursor-default",
        contenteditable: "false",
      }),
      `{{${HTMLAttributes.token}}}`,
    ]
  },

  // When exported to HTML for storage, write the raw {{token}} syntax
  // so the send path can interpolate it.
  addStorage() {
    return {}
  },
})

// Custom HTML serializer: replace chip nodes with raw {{token}} syntax in output
function editorHtmlToStorage(editor: Editor): string {
  const html = editor.getHTML()
  // Replace chip spans with raw tokens
  return html.replace(
    /<span[^>]*data-variable="([^"]+)"[^>]*>.*?<\/span>/g,
    (_, token) => `{{${token}}}`,
  )
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
      disabled={disabled}
      title={title}
      className={`px-2 py-1 rounded text-sm font-medium transition-colors ${
        active
          ? "bg-gray-200 text-gray-900"
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Variable picker dropdown
// ---------------------------------------------------------------------------

function VariablePicker({
  stage,
  onInsert,
}: {
  stage: 1 | 2 | 3
  onInsert: (variable: TemplateVariable) => void
}) {
  const [open, setOpen] = useState(false)
  const available = TEMPLATE_VARIABLES.filter((v) => !v.stage3Only || stage === 3)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 px-2 py-1 rounded text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
      >
        <span>+ Insert variable</span>
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-10">
          {available.map((v) => (
            <button
              key={v.token}
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => {
                onInsert(v)
                setOpen(false)
              }}
            >
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 mr-2">
                {v.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main editor component
// ---------------------------------------------------------------------------

export type EditorTab = "visual" | "html" | "text"

interface TemplateEditorProps {
  stage: 1 | 2 | 3
  htmlBody: string
  textBody: string
  onHtmlChange: (html: string) => void
  onTextChange: (text: string) => void
}

export interface TemplateEditorHandle {
  insertVariable: (v: TemplateVariable) => void
}

export const TemplateEditor = forwardRef<TemplateEditorHandle, TemplateEditorProps>(function TemplateEditor({
  stage,
  htmlBody,
  textBody,
  onHtmlChange,
  onTextChange,
}, ref) {
  const [activeTab, setActiveTab] = useState<EditorTab>("visual")
  const [rawHtml, setRawHtml] = useState(htmlBody)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Write your email here…" }),
      VariableChip,
    ],
    content: htmlBody,
    onUpdate({ editor }) {
      const stored = editorHtmlToStorage(editor)
      setRawHtml(stored)
      onHtmlChange(stored)
    },
  })

  const insertVariable = useCallback(
    (variable: TemplateVariable) => {
      if (activeTab === "visual" && editor) {
        editor
          .chain()
          .focus()
          .insertContent({
            type: "variableChip",
            attrs: { token: variable.token, label: variable.label },
          })
          .run()
      } else if (activeTab === "html") {
        const token = `{{${variable.token}}}`
        const ta = document.querySelector<HTMLTextAreaElement>("[data-html-source]")
        if (ta) {
          const start = ta.selectionStart
          const end = ta.selectionEnd
          const newVal = rawHtml.slice(0, start) + token + rawHtml.slice(end)
          setRawHtml(newVal)
          onHtmlChange(newVal)
          // Sync back to TipTap
          editor?.commands.setContent(newVal)
        }
      } else if (activeTab === "text") {
        const token = `{{${variable.token}}}`
        const ta = document.querySelector<HTMLTextAreaElement>("[data-text-source]")
        if (ta) {
          const start = ta.selectionStart
          const end = ta.selectionEnd
          const current = ta.value
          const newVal = current.slice(0, start) + token + current.slice(end)
          onTextChange(newVal)
        }
      }
    },
    [activeTab, editor, rawHtml, onHtmlChange, onTextChange],
  )

  useImperativeHandle(ref, () => ({ insertVariable }), [insertVariable])

  const handleTabChange = (tab: EditorTab) => {
    // Sync HTML source → TipTap when switching from html tab
    if (activeTab === "html" && tab !== "html" && editor) {
      editor.commands.setContent(rawHtml)
    }
    setActiveTab(tab)
  }

  const handleRawHtmlChange = (value: string) => {
    setRawHtml(value)
    onHtmlChange(value)
  }

  const tabs: { id: EditorTab; label: string }[] = [
    { id: "visual", label: "✏ Edit" },
    { id: "html", label: "< > HTML" },
    { id: "text", label: "¶ Plain text" },
  ]

  return (
    <div className="border border-gray-300 rounded-md overflow-hidden">
      {/* Tab header + variable picker */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-2">
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <VariablePicker stage={stage} onInsert={insertVariable} />
      </div>

      {/* Formatting toolbar (Visual tab only) */}
      {activeTab === "visual" && editor && (
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1 border-b border-gray-200 bg-white">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive("bold")}
            title="Bold"
          >
            <strong>B</strong>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive("italic")}
            title="Italic"
          >
            <em>I</em>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            active={editor.isActive("underline")}
            title="Underline"
          >
            <span className="underline">U</span>
          </ToolbarButton>
          <span className="w-px h-4 bg-gray-300 mx-1" />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive("bulletList")}
            title="Bullet list"
          >
            ≡
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive("orderedList")}
            title="Numbered list"
          >
            1.
          </ToolbarButton>
          <span className="w-px h-4 bg-gray-300 mx-1" />
          <ToolbarButton
            onClick={() => {
              const url = window.prompt("Enter URL")
              if (url) editor.chain().focus().setLink({ href: url }).run()
            }}
            active={editor.isActive("link")}
            title="Insert link"
          >
            🔗
          </ToolbarButton>
        </div>
      )}

      {/* Editor content */}
      <div className="bg-white">
        {activeTab === "visual" && (
          <EditorContent
            editor={editor}
            className="prose prose-sm max-w-none px-3 py-2 min-h-[160px] focus-within:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[140px]"
          />
        )}
        {activeTab === "html" && (
          <textarea
            data-html-source
            value={rawHtml}
            onChange={(e) => handleRawHtmlChange(e.target.value)}
            rows={8}
            spellCheck={false}
            className="w-full px-3 py-2 text-xs font-mono text-gray-700 focus:outline-none resize-none"
            placeholder="<p>HTML source…</p>"
          />
        )}
        {activeTab === "text" && (
          <textarea
            data-text-source
            value={textBody}
            onChange={(e) => onTextChange(e.target.value)}
            rows={8}
            className="w-full px-3 py-2 text-sm text-gray-700 focus:outline-none resize-none"
            placeholder="Plain text fallback for email clients that don't support HTML…"
          />
        )}
      </div>
    </div>
  )
})
