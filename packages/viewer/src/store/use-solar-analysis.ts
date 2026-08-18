import { create } from 'zustand'

export type SolarAnalysisResult = Record<string, number> // NodeId -> insolation value (0-1)

interface SolarAnalysisState {
  isAnalyzing: boolean
  progress: number
  results: SolarAnalysisResult | null

  startAnalysis: () => void
  setProgress: (progress: number) => void
  completeAnalysis: (results: SolarAnalysisResult) => void
  clearAnalysis: () => void
}

export const useSolarAnalysis = create<SolarAnalysisState>((set) => ({
  isAnalyzing: false,
  progress: 0,
  results: null,

  startAnalysis: () => set({ isAnalyzing: true, progress: 0, results: null }),
  setProgress: (progress) => set({ progress }),
  completeAnalysis: (results) => set({ isAnalyzing: false, progress: 100, results }),
  clearAnalysis: () => set({ isAnalyzing: false, progress: 0, results: null }),
}))
