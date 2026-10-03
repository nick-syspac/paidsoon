import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { z } from "zod"

import {
  evaluateSyntheticSpendClassification,
  exportSyntheticSpendFixtureCsv,
  SYNTHETIC_FIXTURE_REVIEW,
  SYNTHETIC_SPEND_EVALUATION_FIXTURE,
  type JevEvaluationObservation,
} from "@/lib/spendClassification/evaluation"

const ObservationSchema = z.object({
  categoryId: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  probabilities: z.record(z.string(), z.number().min(0).max(1)).optional(),
  latencyMs: z.number().nonnegative().optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  model: z.string().optional(),
  errorCode: z.string().optional(),
}).strict()
const ObservationsSchema = z.record(z.string(), ObservationSchema)

function readArguments(argv: string[]): {
  jevResultsPath?: string
  inputPricePerMillion?: number
  outputPricePerMillion: number
  exportCandidate: boolean
  exportCandidateCsv: boolean
} {
  let jevResultsPath: string | undefined
  let inputPricePerMillion: number | undefined
  let outputPricePerMillion = 0
  let exportCandidate = false
  let exportCandidateCsv = false
  for (const argument of argv) {
    if (argument.startsWith("--jev-results=")) {
      jevResultsPath = argument.slice("--jev-results=".length)
    } else if (argument.startsWith("--input-price-per-million=")) {
      const parsed = Number(argument.slice("--input-price-per-million=".length))
      if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Invalid input-token price")
      inputPricePerMillion = parsed
    } else if (argument.startsWith("--output-price-per-million=")) {
      const parsed = Number(argument.slice("--output-price-per-million=".length))
      if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Invalid output-token price")
      outputPricePerMillion = parsed
    } else if (argument === "--export-candidate") {
      exportCandidate = true
    } else if (argument === "--export-candidate-csv") {
      exportCandidateCsv = true
    } else {
      throw new Error("Unsupported evaluation option")
    }
  }
  if (exportCandidate && exportCandidateCsv) throw new Error("Choose one candidate export format")
  return { jevResultsPath, inputPricePerMillion, outputPricePerMillion, exportCandidate, exportCandidateCsv }
}

function readJevObservations(path?: string): Record<string, JevEvaluationObservation> {
  if (!path) return {}
  const parsed = ObservationsSchema.safeParse(JSON.parse(readFileSync(resolve(path), "utf8")))
  if (!parsed.success) throw new Error("Jev observations file has an invalid shape")
  return parsed.data
}

try {
  const options = readArguments(process.argv.slice(2))
  if (options.exportCandidateCsv) {
    process.stdout.write(exportSyntheticSpendFixtureCsv())
  } else if (options.exportCandidate) {
    process.stdout.write(`${JSON.stringify({
      status: evaluateSyntheticSpendClassification(SYNTHETIC_SPEND_EVALUATION_FIXTURE).fixtureStatus,
      review: SYNTHETIC_FIXTURE_REVIEW,
      records: SYNTHETIC_SPEND_EVALUATION_FIXTURE,
    }, null, 2)}\n`)
  } else {
    const report = evaluateSyntheticSpendClassification(
      SYNTHETIC_SPEND_EVALUATION_FIXTURE,
      readJevObservations(options.jevResultsPath),
      options.inputPricePerMillion,
      options.outputPricePerMillion,
    )
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  }
} catch {
  process.stderr.write("Spend classification evaluation failed; check input options and observation file shape.\n")
  process.exitCode = 1
}
