import { useEffect, useState } from "react"
import { useParams, Link, useNavigate } from "react-router-dom"
import { getArticleById, getArticleReviewStats, getReviewerIdFromAuth } from "@/lib/api"
import type { Article } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Building2, Calendar } from "lucide-react"
import { ArticleComments } from "@/components/ArticleComments"
import { InfluenceNarrativeMap } from "@/components/InfluenceNarrativeMap"
import { useAuth } from "@/lib/auth"

export default function ArticleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [article, setArticle] = useState<Article | null>(null)
  const [reviewCount, setReviewCount] = useState<number>(0)
  const [reviewerId, setReviewerId] = useState<string | null>(null)

  function handleReviewClick() {
    if (!article) return
    if (user) {
      // Navigate to reviewer hub - they can start a session and find this article
      navigate("/reviewer", { state: { suggestedArticleId: article.id } })
    } else {
      navigate("/login", { state: { redirectTo: `/article/${article.id}` } })
    }
  }

  useEffect(() => {
    if (id) {
      getArticleById(id).then(async (a) => {
        setArticle(a || null)
        if (a) {
          const stats = await getArticleReviewStats(a.id)
          setReviewCount(stats.reviewCount)
        }
      })
    }
    if (user) {
      getReviewerIdFromAuth(user.id).then(setReviewerId)
    }
  }, [id, user])

  if (!article) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading...
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-8">

      {/* Back */}
      <Link
        to="/explorer"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Explorer
      </Link>

      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">{article.headline}</h1>

        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Building2 className="h-4 w-4" />
            {article.publisher}
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            {new Date(article.date).toLocaleDateString()}
          </span>
        </div>

        <div className="flex items-center justify-between pt-4">
          <p className="text-sm text-muted-foreground">
            {reviewCount}{" "}
            {reviewCount === 1 ? "person has" : "people have"} reviewed this article
          </p>
          <Button size="sm" onClick={handleReviewClick}>
            Review this article
          </Button>
        </div>
      </div>

      {/* Comments */}
      <ArticleComments
        articleId={article.id}
        isReviewer={!!reviewerId}
        reviewerId={reviewerId}
      />

      {/* Influence & Narrative Map — replaces the old two-column grid */}
      <InfluenceNarrativeMap article={article} />

    </div>
  )
}
