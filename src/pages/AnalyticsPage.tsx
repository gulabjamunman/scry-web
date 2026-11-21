import { useEffect, useState } from "react"
import { getDashboardStats, getAiHumanComparison } from "@/lib/api"
import type { DashboardStats } from "@/lib/types"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell
} from "recharts"



const PIE_COLORS = [
  "hsl(145, 60%, 42%)",
  "hsl(215, 50%, 65%)",
  "hsl(30, 90%, 55%)",
  "hsl(0, 50%, 65%)",
  "hsl(0, 85%, 48%)"
]



export default function AnalyticsPage() {

  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [comparisonData, setComparisonData] = useState<any[]>([])

  useEffect(() => {

    getDashboardStats()
      .then(setStats)
      .catch(err => {
        console.error("Dashboard stats error:", err)
        setStats(null)
      })

    getAiHumanComparison()
      .then(setComparisonData)
      .catch(err => {
        console.error("AI vs Human comparison error:", err)
        setComparisonData([])
      })

  }, [])


  if (!stats)
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading analytics...
      </div>
    )



  function normalizeDistribution(
    source: any[] | undefined,
    labelKey: string,
    valueKey: string
  ) {
    if (!source || !Array.isArray(source))
      return []

    return source.map((item, i) => ({
      level:
        item?.[labelKey]
        ?? item?.level
        ?? item?.range
        ?? `Level ${i + 1}`,
      count:
        Number(item?.[valueKey]
        ?? item?.count
        ?? item?.value
        ?? 0)
    }))
  }



  const sensationalismData =
    normalizeDistribution(
      stats.intensityDistribution,
      "range",
      "count"
    )

  const tribalData =
    normalizeDistribution(
      stats.tribalDistribution,
      "level",
      "count"
    )

  const rawThreat =
    normalizeDistribution(
      (stats as any).threatDistribution,
      "level",
      "count"
    )

  const threatData =
    rawThreat.length ? rawThreat : tribalData



  return (

    <div className="p-6 lg:p-8 space-y-8">

      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Analytics Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Behavioral distributions and AI–Human calibration
        </p>
      </div>



      {/* ===============================
         DISTRIBUTIONS
      =============================== */}

      <div className="grid gap-6 lg:grid-cols-2">

        <DistributionBarChart
          title="Sensationalism Distribution"
          data={sensationalismData}
          color="hsl(var(--intensity-orange))"
        />

        <DistributionBarChart
          title="Threat Signal Distribution"
          data={threatData}
          color="hsl(var(--destructive))"
        />

        <DistributionPieChart
          title="Us vs Them Distribution"
          data={tribalData}
        />

      </div>



      {/* ===============================
         AI vs Human Calibration (Compact)
      =============================== */}

      <div className="rounded-xl border bg-card shadow-sm p-6 space-y-6">

        <div>
          <h2 className="text-base font-semibold">
            AI vs Human Calibration
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Probabilistic model estimate vs human epistemic consensus. All values on 0–5 scale.
          </p>
        </div>

        <div className="space-y-5">

          {comparisonData.map((item, i) => {

            const maxScale = 5
            const aiWidth  = Math.min((item.aiAvg  / maxScale) * 100, 100)
            const humanWidth = Math.min((item.humanAvg / maxScale) * 100, 100)

            // delta is human - ai: positive means humans rate higher
            const delta = item.delta ?? 0
            const absDelta = item.absDelta ?? Math.abs(delta)
            const humanSD = item.humanSD ?? 0

            const divergenceColor =
              absDelta < 0.5
                ? "text-green-600 dark:text-green-400"
                : absDelta < 1.5
                ? "text-yellow-600 dark:text-yellow-400"
                : "text-red-600 dark:text-red-400"

            return (

              <div key={i} className="space-y-2">

                {/* Metric label + delta */}
                <div className="flex items-center justify-between text-sm font-medium">
                  <span className="capitalize">
                    {item.metric.replace(/_/g, " ")}
                  </span>
                  <div className="flex items-center gap-3">
                    {/* Human SD badge */}
                    <span className="text-xs text-muted-foreground">
                      σ {humanSD.toFixed(2)}
                    </span>
                    {/* Delta */}
                    <span className={divergenceColor}>
                      {delta > 0 ? "▲" : "▼"} {absDelta.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* AI bar */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-12 text-xs text-muted-foreground text-right shrink-0">
                      AI
                    </span>
                    <div className="flex-1 h-2 bg-muted rounded">
                      <div
                        className="h-2 bg-primary rounded transition-all"
                        style={{ width: `${aiWidth}%` }}
                      />
                    </div>
                    <span className="w-8 text-xs text-right shrink-0">
                      {item.aiAvg.toFixed(2)}
                    </span>
                  </div>

                  {/* Human bar */}
                  <div className="flex items-center gap-2">
                    <span className="w-12 text-xs text-muted-foreground text-right shrink-0">
                      Human
                    </span>
                    <div className="flex-1 h-2 bg-muted rounded">
                      <div
                        className="h-2 bg-slate-500 rounded transition-all"
                        style={{ width: `${humanWidth}%` }}
                      />
                    </div>
                    <span className="w-8 text-xs text-right shrink-0">
                      {item.humanAvg.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Calibration signal */}
                {item.signal && (
                  <p className="text-xs text-muted-foreground pl-14">
                    {item.signal}
                  </p>
                )}

              </div>

            )
          })}

        </div>

        {/* Legend */}
        <div className="text-xs text-muted-foreground pt-4 border-t space-y-1">
          <p>
            <span className="inline-block w-3 h-2 rounded-sm bg-primary mr-1.5 align-middle" />
            AI — model point estimate, scaled to 0–5
          </p>
          <p>
            <span className="inline-block w-3 h-2 rounded-sm bg-slate-500 mr-1.5 align-middle" />
            Human — reviewer consensus average, 0–5
          </p>
          <p>σ = human standard deviation (reviewer agreement). Lower = stronger consensus.</p>
          <p>▲ Humans rate higher than AI. ▼ AI rates higher than humans.</p>
        </div>

      </div>

    </div>

  )

}



/* ============================================================
   BAR CHART COMPONENT
============================================================ */

function DistributionBarChart({
  title,
  data,
  color
}: {
  title: string
  data: { level: string, count: number }[]
  color: string
}) {

  const safeData =
    data.map((item, i) => ({
      level: item.level || `Level ${i + 1}`,
      count: Number(item.count) || 0
    }))

  return (
    <div className="rounded-lg border bg-card p-5 shadow-sm">

      <h2 className="mb-4 text-sm font-semibold">
        {title}
      </h2>

      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={safeData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="level" tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Bar
            dataKey="count"
            fill={color}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>

    </div>
  )
}



/* ============================================================
   PIE CHART COMPONENT (Optimized Layout)
============================================================ */

function DistributionPieChart({
  title,
  data
}: {
  title: string
  data: { level: string, count: number }[]
}) {

  const safeData =
    data.map((item, i) => ({
      level: item.level || `Level ${i + 1}`,
      count: Number(item.count) || 0,
      key: `${title}-${i}`
    }))

  return (
    <div className="rounded-lg border bg-card p-5 shadow-sm lg:col-span-2">

      <h2 className="mb-4 text-sm font-semibold">
        {title}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">

        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={safeData}
              dataKey="count"
              nameKey="level"
              cx="50%"
              cy="50%"
              outerRadius={80}
            >
              {safeData.map((entry, i) => (
                <Cell
                  key={entry.key}
                  fill={PIE_COLORS[i % PIE_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>

        <div className="space-y-2">
          {safeData.map((item, i) => (
            <div
              key={item.key}
              className="flex items-center justify-between text-sm"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-sm"
                  style={{
                    backgroundColor:
                      PIE_COLORS[i % PIE_COLORS.length]
                  }}
                />
                <span>{item.level}</span>
              </div>
              <span className="font-medium">
                {item.count}
              </span>
            </div>
          ))}
        </div>

      </div>

    </div>
  )
}
