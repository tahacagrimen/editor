import { useSolarAnalysis } from '@pascal-app/viewer'
import { Play, Square } from 'lucide-react'

export function SolarAnalysisUI() {
  const isAnalyzing = useSolarAnalysis((state) => state.isAnalyzing)
  const progress = useSolarAnalysis((state) => state.progress)
  const results = useSolarAnalysis((state) => state.results)
  const startAnalysis = useSolarAnalysis((state) => state.startAnalysis)
  const clearAnalysis = useSolarAnalysis((state) => state.clearAnalysis)

  const hasResults = results !== null

  return (
    <div className="flex flex-col border-border/40 border-b">
      <div className="flex items-center gap-1.5 px-3 pt-3 pb-1.5">
        <span className="font-semibold text-muted-foreground text-xs tracking-tight">
          Annual Solar Insolation
        </span>
        <button
          className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
          onClick={() => {
            if (isAnalyzing) clearAnalysis()
            else if (hasResults) clearAnalysis()
            else startAnalysis()
          }}
          type="button"
        >
          {isAnalyzing ? (
            <Square className="inline-block h-3 w-3 mr-1" />
          ) : hasResults ? (
            'Clear'
          ) : (
            <Play className="inline-block h-3 w-3 mr-1" />
          )}
          {isAnalyzing ? 'Stop' : hasResults ? '' : 'Analyze'}
        </button>
      </div>

      {isAnalyzing && (
        <div className="px-3 pb-3">
          <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
            <span>Calculating...</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {hasResults && !isAnalyzing && (
        <div className="px-3 pb-3">
          <p className="text-[11px] text-muted-foreground/60 mb-2">
            Surfaces are colored by annual sun exposure.
          </p>
          <div className="flex flex-col gap-1">
            <div className="flex h-2 w-full rounded-sm bg-gradient-to-r from-blue-900 via-orange-400 to-yellow-200" />
            <div className="flex justify-between text-[9px] text-muted-foreground tabular-nums">
              <span>Shadowed</span>
              <span>Full Sun</span>
            </div>
          </div>
        </div>
      )}
      
      {!isAnalyzing && !hasResults && (
        <p className="px-3 pb-3 text-[11px] text-muted-foreground/60">
          Calculate annual solar exposure per surface.
        </p>
      )}
    </div>
  )
}
