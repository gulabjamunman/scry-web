import { useState, useEffect, useRef, useCallback } from "react"
import {
  getArticleComments,
  addComment,
  editComment,
  deleteComment,
  voteComment,
  flagComment,
  type Comment,
} from "@/lib/api"
import { useAuth } from "@/lib/auth"
import {
  MessageSquare, ThumbsUp, ThumbsDown, Flag, Reply,
  Pencil, Trash2, Eye, EyeOff, ChevronDown, ChevronUp,
} from "lucide-react"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"

// ─── Types ────────────────────────────────────────────────────────────────────

type SelectionAnchor = {
  start_char: number
  end_char: number
  selected_text: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCharOffset(
  container: HTMLElement,
  node: Node,
  offset: number
): number {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let charCount = 0
  let current: Node | null
  while ((current = walker.nextNode())) {
    if (current === node) return charCount + offset
    charCount += current.textContent?.length ?? 0
  }
  return charCount + offset
}

function highlightRanges(
  container: HTMLElement,
  comments: Comment[],
  activeId: string | null,
  onClickAnnotation: (id: string) => void
) {
  container.querySelectorAll("mark[data-annotation]").forEach((el) => {
    const parent = el.parentNode
    if (parent) {
      while (el.firstChild) parent.insertBefore(el.firstChild, el)
      parent.removeChild(el)
    }
  })

  const anchored = comments
    .filter((c) => c.start_char != null && c.end_char != null && !c.parent_id)
    .sort((a, b) => (a.start_char ?? 0) - (b.start_char ?? 0))

  if (!anchored.length) return

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const textNodes: { node: Text; start: number; end: number }[] = []
  let pos = 0
  let current: Node | null
  while ((current = walker.nextNode())) {
    const len = current.textContent?.length ?? 0
    textNodes.push({ node: current as Text, start: pos, end: pos + len })
    pos += len
  }

  anchored.forEach((comment) => {
    const s = comment.start_char!
    const e = comment.end_char!
    const isActive = comment.id === activeId

    textNodes.forEach(({ node, start, end }) => {
      if (end <= s || start >= e) return
      const localStart = Math.max(s - start, 0)
      const localEnd   = Math.min(e - start, node.length)
      if (localStart >= localEnd) return

      try {
        const range = document.createRange()
        range.setStart(node, localStart)
        range.setEnd(node, localEnd)

        const mark = document.createElement("mark")
        mark.dataset.annotation = comment.id
        mark.style.cssText = isActive
          ? "background:hsl(45,90%,65%);border-radius:2px;cursor:pointer;padding:0 1px;"
          : "background:hsl(45,80%,80%,0.5);border-radius:2px;cursor:pointer;padding:0 1px;"
        mark.title = `${comment.reviewer_name}: ${comment.comment.slice(0, 60)}...`
        mark.addEventListener("click", () => onClickAnnotation(comment.id))
        range.surroundContents(mark)
      } catch {
        // Range spans multiple nodes — skip gracefully
      }
    })
  })
}

// ─── Comment Card ─────────────────────────────────────────────────────────────

function CommentCard({
  comment,
  articleId,
  isReviewer,
  currentReviewerId,
  onReply,
  onUpdate,
  depth,
}: {
  comment: Comment
  articleId: string
  isReviewer: boolean
  currentReviewerId: string | null
  onReply: (parentId: string, parentName: string) => void
  onUpdate: () => void
  depth: number
}) {
  const [editing, setEditing]             = useState(false)
  const [editText, setEditText]           = useState(comment.comment)
  const [showReplies, setShowReplies]     = useState(true)
  const [flagReason, setFlagReason]       = useState("")
  const [showFlagInput, setShowFlagInput] = useState(false)
  const isOwn = comment.reviewer_id === currentReviewerId

  async function handleVote(v: 1 | -1) {
    try {
      await voteComment(comment.id, v)
      onUpdate()
    } catch {
      toast.error("Could not record vote")
    }
  }

  async function handleEdit() {
    if (!editText.trim()) return
    try {
      await editComment(comment.id, editText)
      setEditing(false)
      toast.success("Comment updated")
      onUpdate()
    } catch {
      toast.error("Could not update comment")
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this comment?")) return
    try {
      await deleteComment(comment.id)
      toast.success("Comment deleted")
      onUpdate()
    } catch {
      toast.error("Could not delete comment")
    }
  }

  async function handleFlag() {
    try {
      await flagComment(comment.id, flagReason || undefined)
      setShowFlagInput(false)
      toast.success("Comment flagged for review")
      onUpdate()
    } catch {
      toast.error("Could not flag comment")
    }
  }

  const replyCount = comment.replies?.length ?? 0
  const indent = Math.min(depth, 3) * 16

  return (
    <div
      style={{ marginLeft: indent }}
      className={`border-l-2 pl-3 py-1 ${depth > 0 ? "border-muted" : "border-transparent"}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-semibold">{comment.reviewer_name}</span>
        {comment.edited && (
          <span className="text-xs text-muted-foreground italic">(edited)</span>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
        </span>
      </div>

      {comment.selected_text && !comment.parent_id && (
        <blockquote className="text-xs text-muted-foreground border-l-2 border-amber-400 pl-2 mb-1 italic truncate">
          "{comment.selected_text.slice(0, 100)}
          {comment.selected_text.length > 100 ? "…" : ""}"
        </blockquote>
      )}

      {editing ? (
        <div className="space-y-1 mb-1">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={3}
            className="w-full text-sm rounded border p-2 bg-background"
          />
          <div className="flex gap-2">
            <button
              onClick={handleEdit}
              className="text-xs px-2 py-1 rounded bg-primary text-white"
            >
              Save
            </button>
            <button
              onClick={() => { setEditing(false); setEditText(comment.comment) }}
              className="text-xs px-2 py-1 rounded border"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm mb-1">{comment.comment}</p>
      )}

      {showFlagInput && (
        <div className="space-y-1 mb-1">
          <input
            value={flagReason}
            onChange={(e) => setFlagReason(e.target.value)}
            placeholder="Reason (optional)"
            className="w-full text-xs rounded border p-1 bg-background"
          />
          <div className="flex gap-2">
            <button
              onClick={handleFlag}
              className="text-xs px-2 py-1 rounded bg-destructive text-white"
            >
              Submit flag
            </button>
            <button
              onClick={() => setShowFlagInput(false)}
              className="text-xs px-2 py-1 rounded border"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <button
          onClick={() => handleVote(1)}
          className={`flex items-center gap-1 hover:text-green-600 transition-colors ${comment.user_vote === 1 ? "text-green-600 font-semibold" : ""}`}
        >
          <ThumbsUp className="h-3 w-3" />
          {comment.upvotes}
        </button>
        <button
          onClick={() => handleVote(-1)}
          className={`flex items-center gap-1 hover:text-red-500 transition-colors ${comment.user_vote === -1 ? "text-red-500 font-semibold" : ""}`}
        >
          <ThumbsDown className="h-3 w-3" />
          {comment.downvotes}
        </button>

        {isReviewer && (
          <button
            onClick={() => onReply(comment.id, comment.reviewer_name ?? "Reviewer")}
            className="flex items-center gap-1 hover:text-primary transition-colors"
          >
            <Reply className="h-3 w-3" />
            Reply
          </button>
        )}

        {isOwn && !editing && (
          <>
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1 hover:text-primary transition-colors"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-1 hover:text-destructive transition-colors"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </>
        )}

        {!isOwn && (
          <button
            onClick={() => setShowFlagInput((v) => !v)}
            className={`flex items-center gap-1 hover:text-amber-500 transition-colors ${comment.flagged ? "text-amber-500" : ""}`}
          >
            <Flag className="h-3 w-3" />
          </button>
        )}

        {replyCount > 0 && (
          <button
            onClick={() => setShowReplies((v) => !v)}
            className="flex items-center gap-1 ml-auto hover:text-primary transition-colors"
          >
            {showReplies
              ? <ChevronUp className="h-3 w-3" />
              : <ChevronDown className="h-3 w-3" />
            }
            {replyCount} {replyCount === 1 ? "reply" : "replies"}
          </button>
        )}
      </div>

      {showReplies && comment.replies && comment.replies.length > 0 && (
        <div className="mt-2 space-y-3">
          {comment.replies.map((reply) => (
            <CommentCard
              key={reply.id}
              comment={reply}
              articleId={articleId}
              isReviewer={isReviewer}
              currentReviewerId={currentReviewerId}
              onReply={onReply}
              onUpdate={onUpdate}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function ArticleComments({
  articleId,
  contentRef,   // optional — only used when article text is rendered in the same DOM
  isReviewer,
  reviewerId,
}: {
  articleId: string
  contentRef?: React.RefObject<HTMLElement>   // was required, now optional
  isReviewer: boolean
  reviewerId: string | null
}) {
  const { user } = useAuth()
  const [comments, setComments]     = useState<Comment[]>([])
  const [visible, setVisible]       = useState(true)
  const [activeId, setActiveId]     = useState<string | null>(null)
  const [selection, setSelection]   = useState<SelectionAnchor | null>(null)
  const [composing, setComposing]   = useState(false)
  const [newText, setNewText]       = useState("")
  const [replyTo, setReplyTo]       = useState<{ id: string; name: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const popoverRef                  = useRef<HTMLDivElement>(null)
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null)

  const loadComments = useCallback(async () => {
    try {
      const data = await getArticleComments(articleId)
      setComments(data)
    } catch {
      toast.error("Could not load comments")
    }
  }, [articleId])

  useEffect(() => { loadComments() }, [loadComments])

  // Highlight comment ranges — only when a contentRef is provided and valid
  useEffect(() => {
    if (!contentRef?.current || !visible) return
    highlightRanges(
      contentRef.current,
      comments,
      activeId,
      (id) => { setActiveId(id); setVisible(true) }
    )
  }, [comments, activeId, visible, contentRef])

  // Text selection handler — only when a contentRef is provided
  useEffect(() => {
    if (!isReviewer || !contentRef?.current) return

    function onMouseUp() {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        setSelection(null)
        setPopoverPos(null)
        return
      }

      const range = sel.getRangeAt(0)
      const text  = sel.toString().trim()
      if (!text || text.length < 3) return

      const container = contentRef!.current!
      const start = getCharOffset(container, range.startContainer, range.startOffset)
      const end   = getCharOffset(container, range.endContainer, range.endOffset)

      const rect          = range.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()

      setSelection({ start_char: start, end_char: end, selected_text: text })
      setPopoverPos({
        top:  rect.bottom - containerRect.top + 8,
        left: rect.left   - containerRect.left,
      })
    }

    const el = contentRef.current
    el.addEventListener("mouseup", onMouseUp)
    return () => el.removeEventListener("mouseup", onMouseUp)
  }, [isReviewer, contentRef])

  async function handleSubmit() {
    if (!newText.trim()) return
    setSubmitting(true)
    try {
      await addComment({
        article_id:    articleId,
        comment:       newText,
        start_char:    replyTo ? null : (selection?.start_char ?? null),
        end_char:      replyTo ? null : (selection?.end_char ?? null),
        selected_text: replyTo ? null : (selection?.selected_text ?? null),
        parent_id:     replyTo?.id ?? null,
      })
      setNewText("")
      setSelection(null)
      setPopoverPos(null)
      setComposing(false)
      setReplyTo(null)
      toast.success("Comment added")
      await loadComments()
    } catch {
      toast.error("Could not post comment")
    } finally {
      setSubmitting(false)
    }
  }

  function handleReply(parentId: string, parentName: string) {
    setReplyTo({ id: parentId, name: parentName })
    setComposing(true)
    setSelection(null)
    setPopoverPos(null)
  }

  const totalCount = comments.reduce(
    (acc, c) => acc + 1 + (c.replies?.length ?? 0),
    0
  )

  return (
    <div className="relative">

      {/* Selection popover — only renders when contentRef is active */}
      {selection && popoverPos && isReviewer && (
        <div
          ref={popoverRef}
          style={{ top: popoverPos.top, left: popoverPos.left }}
          className="absolute z-50 bg-card border rounded-lg shadow-lg p-1"
        >
          <button
            onClick={() => { setComposing(true); setPopoverPos(null) }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded hover:bg-muted transition-colors"
          >
            <MessageSquare className="h-3 w-3" />
            Comment on selection
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between py-3 border-t mt-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            Annotations
            {totalCount > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({totalCount})
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isReviewer && !composing && (
            <button
              onClick={() => { setComposing(true); setSelection(null) }}
              className="text-xs px-3 py-1 rounded border hover:bg-muted transition-colors"
            >
              + Add note
            </button>
          )}
          <button
            onClick={() => setVisible((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {visible
              ? <EyeOff className="h-3.5 w-3.5" />
              : <Eye className="h-3.5 w-3.5" />
            }
            {visible ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      {visible && (
        <div className="space-y-4">

          {/* Compose box */}
          {composing && (
            <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
              {replyTo && (
                <p className="text-xs text-muted-foreground">
                  Replying to{" "}
                  <span className="font-medium">{replyTo.name}</span>
                  <button
                    onClick={() => setReplyTo(null)}
                    className="ml-2 underline"
                  >
                    cancel
                  </button>
                </p>
              )}
              {selection && !replyTo && (
                <blockquote className="text-xs text-muted-foreground border-l-2 border-amber-400 pl-2 italic truncate">
                  "{selection.selected_text.slice(0, 100)}"
                </blockquote>
              )}
              <textarea
                autoFocus
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder={
                  replyTo
                    ? `Reply to ${replyTo.name}...`
                    : selection
                    ? "Comment on selected text..."
                    : "Add a note about this article..."
                }
                rows={3}
                className="w-full text-sm rounded border p-2 bg-background resize-none"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setComposing(false)
                    setNewText("")
                    setReplyTo(null)
                    setSelection(null)
                    setPopoverPos(null)
                  }}
                  className="text-xs px-3 py-1.5 rounded border hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !newText.trim()}
                  className="text-xs px-3 py-1.5 rounded bg-primary text-white disabled:opacity-50"
                >
                  {submitting ? "Posting..." : "Post"}
                </button>
              </div>
            </div>
          )}

          {/* Comment list */}
          {comments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              No annotations yet.
              {isReviewer && " Select text to add the first one."}
            </p>
          ) : (
            <div className="space-y-4">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className={`rounded-lg p-3 transition-colors cursor-pointer ${
                    activeId === comment.id
                      ? "bg-amber-50 dark:bg-amber-950/20 border border-amber-200"
                      : "bg-muted/20 hover:bg-muted/40 border border-transparent"
                  }`}
                  onClick={() =>
                    setActiveId((id) => (id === comment.id ? null : comment.id))
                  }
                >
                  <CommentCard
                    comment={comment}
                    articleId={articleId}
                    isReviewer={isReviewer}
                    currentReviewerId={reviewerId}
                    onReply={handleReply}
                    onUpdate={loadComments}
                    depth={0}
                  />
                </div>
              ))}
            </div>
          )}

        </div>
      )}
    </div>
  )
}
