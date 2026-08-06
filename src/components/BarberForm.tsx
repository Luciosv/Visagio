// Form del barbero, 5 taps (7.7 de CLAUDE.md, más el quinto tap de largo
// actual agregado en Fase 5). Extraído de `NuevoClienteScreen.tsx` en la Fase
// 6b para poder reusarlo tal cual en `screens/BuscarClienteScreen.tsx`: la
// ruta "Ajustar" de un cliente que vuelve muestra el mismo form (textura,
// densidad, restricciones y largo actual pueden haber cambiado desde la
// última visita), sin volver a pasar por foto ni por la clasificación de
// forma de cara.
//
// Todo chips grandes, sin inputs de texto ni formulario tradicional (7.7:
// "presentarlo como chips grandes, seleccionables con el pulgar, no como
// formulario").

import type { ClientFlag, HairDensity, HairTexture, LargoActualArriba } from '../types'
import { HAIR_DENSITIES, HAIR_TEXTURES, LARGO_ACTUAL_ARRIBA_VALUES } from '../types'
import { HAIR_DENSITY_LABELS, HAIR_TEXTURE_LABELS } from '../engine/explain'
import { LARGO_ACTUAL_ARRIBA_LABELS } from '../engine/largoActualArribaThresholds'
import { Chip, ChipGroupSection } from './ui'

/** Grupos de chips de implantación y restricciones (taps 3 y 4a/4b). Se separan a mano (no derivados de `CLIENT_FLAGS`) para no depender del orden en que queden declarados los flags en `types.ts`. */
const IMPLANTATION_FLAGS: readonly ClientFlag[] = ['remolino_coronilla', 'entradas', 'nuca_dificil', 'coronilla_rala']
const RESTRICTION_FLAGS: readonly ClientFlag[] = ['orejas_prominentes', 'cuello_corto', 'gorra_o_casco', 'trabajo_formal']

/** Etiquetas cortas de chip para los flags (distintas de `CLIENT_FLAG_LABELS` de `explain.ts`, que están redactadas para insertarse en una frase, no para un botón). Exportado: la ficha de cliente (sección 5) reusa estas mismas etiquetas para mostrar los flags guardados de una consulta anterior. */
export const FLAG_CHIP_LABELS: Record<ClientFlag, string> = {
  remolino_coronilla: 'Remolino en la coronilla',
  entradas: 'Entradas',
  nuca_dificil: 'Nuca difícil',
  coronilla_rala: 'Coronilla rala',
  orejas_prominentes: 'Orejas prominentes',
  cuello_corto: 'Cuello corto',
  gorra_o_casco: 'Usa gorra o casco',
  trabajo_formal: 'Trabajo formal',
}

/** Cuarto tap (7.7.4): minutos que el cliente está dispuesto a peinarse. "5+" es el piso de un rango abierto (ver `BarberInput.minutosDeclarados`). */
const MINUTOS_DECLARADOS_OPTIONS = [0, 2, 5] as const

export interface BarberFormProps {
  readonly textura: HairTexture | null
  readonly onTextura: (value: HairTexture) => void
  readonly densidad: HairDensity | null
  readonly onDensidad: (value: HairDensity) => void
  readonly flags: readonly ClientFlag[]
  readonly onToggleFlag: (flag: ClientFlag) => void
  readonly minutosDeclarados: number | null
  readonly onMinutosDeclarados: (value: number) => void
  readonly largoActualArriba: LargoActualArriba | null
  readonly onLargoActualArriba: (value: LargoActualArriba) => void
  readonly canSubmit: boolean
  readonly onSubmit: () => void
  readonly submitLabel: string
  readonly cutsError: string | null
}

export function BarberForm({
  textura,
  onTextura,
  densidad,
  onDensidad,
  flags,
  onToggleFlag,
  minutosDeclarados,
  onMinutosDeclarados,
  largoActualArriba,
  onLargoActualArriba,
  canSubmit,
  onSubmit,
  submitLabel,
  cutsError,
}: BarberFormProps) {
  return (
    <div className="mt-6 w-full max-w-sm border-t border-neutral-800 pt-6">
      <h2 className="text-lg font-semibold text-neutral-100">Datos del pelo y del cliente</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Tocá lo que corresponda en cada grupo. Sin formulario, todo con el pulgar.
      </p>

      <ChipGroupSection title="1. Textura">
        {HAIR_TEXTURES.map((value) => (
          <Chip
            key={value}
            label={HAIR_TEXTURE_LABELS[value]}
            selected={textura === value}
            onClick={() => onTextura(value)}
            capitalize
          />
        ))}
      </ChipGroupSection>

      <ChipGroupSection title="2. Densidad">
        {HAIR_DENSITIES.map((value) => (
          <Chip
            key={value}
            label={HAIR_DENSITY_LABELS[value]}
            selected={densidad === value}
            onClick={() => onDensidad(value)}
            capitalize
          />
        ))}
      </ChipGroupSection>

      <ChipGroupSection title="3. Implantación (opcional)">
        {IMPLANTATION_FLAGS.map((flag) => (
          <Chip key={flag} label={FLAG_CHIP_LABELS[flag]} selected={flags.includes(flag)} onClick={() => onToggleFlag(flag)} />
        ))}
      </ChipGroupSection>

      <ChipGroupSection title="4a. Restricciones (opcional)">
        {RESTRICTION_FLAGS.map((flag) => (
          <Chip key={flag} label={FLAG_CHIP_LABELS[flag]} selected={flags.includes(flag)} onClick={() => onToggleFlag(flag)} />
        ))}
      </ChipGroupSection>

      <ChipGroupSection title="4b. Minutos que se dedica a peinar">
        {MINUTOS_DECLARADOS_OPTIONS.map((value) => (
          <Chip
            key={value}
            label={value === 5 ? '5+' : String(value)}
            selected={minutosDeclarados === value}
            onClick={() => onMinutosDeclarados(value)}
          />
        ))}
      </ChipGroupSection>

      <ChipGroupSection title="5. Largo actual arriba">
        {LARGO_ACTUAL_ARRIBA_VALUES.map((value) => (
          <Chip
            key={value}
            label={LARGO_ACTUAL_ARRIBA_LABELS[value]}
            selected={largoActualArriba === value}
            onClick={() => onLargoActualArriba(value)}
          />
        ))}
      </ChipGroupSection>

      {cutsError && (
        <div className="mt-4 rounded-xl border border-red-500 bg-red-950 px-4 py-3 text-sm text-red-200">{cutsError}</div>
      )}

      <button
        type="button"
        disabled={!canSubmit}
        onClick={onSubmit}
        className="mt-6 min-h-14 w-full rounded-xl bg-lime-400 px-6 text-lg font-semibold text-neutral-950 transition active:scale-[0.98] disabled:opacity-40"
      >
        {submitLabel}
      </button>
    </div>
  )
}
