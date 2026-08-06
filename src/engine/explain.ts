// Frase explicativa de una recomendación (Fase 4, sección 9 de CLAUDE.md:
// "explain.ts pesa tanto como el scoring... sin explicación el barbero no lo
// puede usar delante del cliente"). Función pura: entra el desglose que ya
// calculó `recommend.ts` más el contexto (ratios, clasificación, form del
// barbero), sale una frase en español rioplatense.
//
// Mismo criterio que `explainFaceShape` en `vision/faceShape.ts` (reutiliza
// `describeShapeRatio` de ahí: una sola fuente de verdad para "qué ratio
// explica esta forma"): la frase tiene que citar el ratio o el flag CONCRETO
// que más pesó, nunca una frase genérica tipo "este corte te queda bien"
// (ejemplo exacto de la spec: "Sumó por mandíbula marcada (R3 0.94), el
// degradado bajo acompaña el ángulo. Restó un poco por el remolino en
// coronilla.").

import type {
  BarberInput,
  ClientFlag,
  Cut,
  CutRecommendation,
  FaceRatios,
  FaceShapeClassification,
  HairDensity,
  HairTexture,
} from '../types'
import { describeShapeRatio, FACE_SHAPE_LABELS } from '../vision/faceShape'

/** Etiquetas en español rioplatense de textura, para citarlas en la explicación (y reusables por la Fase 5 para los chips del form). */
export const HAIR_TEXTURE_LABELS: Record<HairTexture, string> = {
  lacio: 'lacio',
  ondulado: 'ondulado',
  rulo: 'con rulos',
  muy_rizado: 'muy rizado',
}

/** Etiquetas en español rioplatense de densidad. */
export const HAIR_DENSITY_LABELS: Record<HairDensity, string> = {
  fino: 'fino',
  medio: 'medio',
  grueso: 'grueso',
}

/** Etiquetas en español rioplatense de cada flag, en forma de sustantivo/cláusula para insertar después de "por". */
export const CLIENT_FLAG_LABELS: Record<ClientFlag, string> = {
  remolino_coronilla: 'el remolino en la coronilla',
  entradas: 'las entradas',
  nuca_dificil: 'el nacimiento de nuca irregular',
  coronilla_rala: 'la coronilla rala',
  orejas_prominentes: 'las orejas prominentes',
  cuello_corto: 'el cuello corto',
  gorra_o_casco: 'que usa gorra o casco seguido',
  trabajo_formal: 'el trabajo formal',
}

/** Un candidato de cláusula con su magnitud, para elegir el término dominante sin repetir la lógica de comparación. */
interface Clause {
  readonly magnitude: number
  readonly text: string
}

/**
 * Arma la frase explicativa de una recomendación puntual. Cita el término
 * positivo que más aportó al score y, si hubo alguna penalización, el
 * término negativo que más restó — el mismo patrón de dos cláusulas del
 * ejemplo de la spec ("Sumó por... Restó...").
 */
export function explainRecommendation(
  recommendation: CutRecommendation,
  faceShape: FaceShapeClassification,
  ratios: FaceRatios,
  barberInput: BarberInput,
): string {
  const { cut, breakdown } = recommendation

  const positiveCandidates = buildPositiveClauses(cut, breakdown, faceShape, ratios, barberInput)
  const negativeCandidates = buildNegativeClauses(cut, breakdown, barberInput)

  // `positiveCandidates` siempre trae al menos las 4 cláusulas base (forma
  // top1/top2, textura, densidad), nunca está vacío: `pickDominant` puede
  // asumir un array no vacío acá.
  const dominant = pickDominant(positiveCandidates)
  const sumClause = `Sumó por ${dominant.text}`

  if (negativeCandidates.length === 0) {
    return `${sumClause}.`
  }
  const dominantNegative = pickDominant(negativeCandidates)

  // "Un poco" cuando la penalización es chica en relación a lo que sumó (el
  // mismo matiz del ejemplo de la spec, donde el "restó" es claramente menor
  // que el "sumó"); si la resta es comparable o mayor, no se suaviza.
  const totalPositive = positiveCandidates.reduce((sum, c) => sum + c.magnitude, 0)
  const qualifier = dominantNegative.magnitude < totalPositive * 0.3 ? ' un poco' : ''

  return `${sumClause}. Restó${qualifier} por ${dominantNegative.text}.`
}

function buildPositiveClauses(
  cut: Cut,
  breakdown: CutRecommendation['breakdown'],
  faceShape: FaceShapeClassification,
  ratios: FaceRatios,
  barberInput: BarberInput,
): readonly Clause[] {
  const { top1, top2 } = faceShape

  const clauses: Clause[] = [
    {
      magnitude: breakdown.formaTop1,
      text: `${describeShapeRatio(top1.shape, ratios)} (forma ${FACE_SHAPE_LABELS[top1.shape]}, afinidad ${cut.afinidadForma[top1.shape]}/5 con este corte)`,
    },
    {
      magnitude: breakdown.formaTop2,
      text: `${describeShapeRatio(top2.shape, ratios)} (forma ${FACE_SHAPE_LABELS[top2.shape]}, afinidad ${cut.afinidadForma[top2.shape]}/5 con este corte)`,
    },
    {
      magnitude: breakdown.textura,
      text: `el pelo ${HAIR_TEXTURE_LABELS[barberInput.textura]} (afinidad ${cut.afinidadTextura[barberInput.textura]}/5 con este corte)`,
    },
    {
      magnitude: breakdown.densidad,
      text: `la densidad ${HAIR_DENSITY_LABELS[barberInput.densidad]} (afinidad ${cut.afinidadDensidad[barberInput.densidad]}/5 con este corte)`,
    },
  ]

  if (breakdown.favoreceCoincidentes.length > 0) {
    clauses.push({
      magnitude: breakdown.bonusFavorece,
      text: joinFlags(breakdown.favoreceCoincidentes),
    })
  }

  return clauses
}

function buildNegativeClauses(
  cut: Cut,
  breakdown: CutRecommendation['breakdown'],
  barberInput: BarberInput,
): readonly Clause[] {
  const clauses: Clause[] = []

  if (breakdown.penalizaCoincidentes.length > 0) {
    clauses.push({
      magnitude: breakdown.penalizacionPenaliza,
      text: joinFlags(breakdown.penalizaCoincidentes),
    })
  }

  if (breakdown.minutosExceso > 0) {
    clauses.push({
      magnitude: breakdown.penalizacionPeinado,
      text: `que pide ${cut.minutosDePeinado} min de peinado y el cliente dijo que le dedica ${barberInput.minutosDeclarados}`,
    })
  }

  return clauses
}

/** Junta las etiquetas de flags coincidentes en una sola cláusula ("X" / "X y Z" / "X, Y y Z"). */
function joinFlags(flags: readonly ClientFlag[]): string {
  const labels = flags.map((flag) => CLIENT_FLAG_LABELS[flag])
  if (labels.length === 1) return labels[0]
  return `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`
}

/**
 * Candidato de mayor magnitud. Requiere un array NO VACÍO (llama a
 * `Array.prototype.reduce` sin valor inicial a propósito, para que el tipo
 * de retorno sea `Clause`, no `Clause | undefined`): las dos veces que se usa
 * en `explainRecommendation` ya garantizan un array con al menos un
 * elemento. Primero en el array gana los empates (mismo criterio de
 * prioridad que `recommendWeights.ts`: forma antes que
 * textura/densidad/flags).
 */
function pickDominant(clauses: readonly Clause[]): Clause {
  return clauses.reduce((best, candidate) => (candidate.magnitude > best.magnitude ? candidate : best))
}
