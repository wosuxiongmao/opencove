import { useEffect, useMemo, useState } from 'react'
import {
  createTerminalDisplayCalibrationSignature,
  createTerminalDisplayProfileKey,
  isTerminalDisplayCalibrationForReference,
  isTerminalDisplayReferenceForProfile,
  normalizeTerminalClientDisplayCalibration,
  type TerminalClientDisplayCalibration,
  type TerminalDisplayReference,
} from '../../domain/terminalDisplayCalibration'

const STORAGE_KEY = 'opencove:terminal-display-calibration:v1'
const CHANGE_EVENT = 'opencove:terminal-display-calibration-changed'

function readStorageValue(): TerminalClientDisplayCalibration | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? normalizeTerminalClientDisplayCalibration(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function emitCalibrationChange(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export interface TerminalClientDisplayCalibrationInspection {
  profileKey: string
  rawCalibrationPresent: boolean
  calibrationPresent: boolean
  profileMatches: boolean
  referencePresent: boolean
  referenceMatchesProfile: boolean
  calibrationMatchesReference: boolean
  applicableCalibrationPresent: boolean
  calibrationFontSize: number | null
  calibrationLineHeight: number | null
  calibrationLetterSpacing: number | null
  calibrationScore: number | null
}

export function inspectTerminalClientDisplayCalibration({
  terminalFontSize,
  terminalFontFamily,
  terminalDisplayReference,
}: {
  terminalFontSize: number
  terminalFontFamily: string | null
  terminalDisplayReference: TerminalDisplayReference | null
}): TerminalClientDisplayCalibrationInspection {
  const calibration = readStorageValue()
  const profileKey = createTerminalDisplayProfileKey({ terminalFontSize, terminalFontFamily })
  const profileMatches = calibration?.profileKey === profileKey
  const referenceMatchesProfile = isTerminalDisplayReferenceForProfile(terminalDisplayReference, {
    terminalFontSize,
    terminalFontFamily,
  })
  const calibrationMatchesReference =
    profileMatches &&
    referenceMatchesProfile &&
    isTerminalDisplayCalibrationForReference(calibration, terminalDisplayReference)

  return {
    profileKey,
    rawCalibrationPresent: window.localStorage.getItem(STORAGE_KEY) !== null,
    calibrationPresent: calibration !== null,
    profileMatches,
    referencePresent: terminalDisplayReference !== null,
    referenceMatchesProfile,
    calibrationMatchesReference,
    applicableCalibrationPresent: calibrationMatchesReference,
    calibrationFontSize: calibration?.fontSize ?? null,
    calibrationLineHeight: calibration?.lineHeight ?? null,
    calibrationLetterSpacing: calibration?.letterSpacing ?? null,
    calibrationScore: calibration?.score ?? null,
  }
}

export function readTerminalClientDisplayCalibration({
  terminalFontSize,
  terminalFontFamily,
  terminalDisplayReference,
}: {
  terminalFontSize: number
  terminalFontFamily: string | null
  terminalDisplayReference: TerminalDisplayReference | null
}): TerminalClientDisplayCalibration | null {
  const calibration = readStorageValue()
  if (!calibration) {
    return null
  }

  const profileKey = createTerminalDisplayProfileKey({ terminalFontSize, terminalFontFamily })
  if (calibration.profileKey !== profileKey) {
    return null
  }

  if (
    !isTerminalDisplayReferenceForProfile(terminalDisplayReference, {
      terminalFontSize,
      terminalFontFamily,
    })
  ) {
    return null
  }

  return isTerminalDisplayCalibrationForReference(calibration, terminalDisplayReference)
    ? calibration
    : null
}

export function writeTerminalClientDisplayCalibration(
  calibration: TerminalClientDisplayCalibration,
): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(calibration))
  emitCalibrationChange()
}

export function clearTerminalClientDisplayCalibration(): void {
  window.localStorage.removeItem(STORAGE_KEY)
  emitCalibrationChange()
}

export function useTerminalClientDisplayCalibration({
  terminalFontSize,
  terminalFontFamily,
  terminalDisplayReference,
}: {
  terminalFontSize: number
  terminalFontFamily: string | null
  terminalDisplayReference: TerminalDisplayReference | null
}): TerminalClientDisplayCalibration | null {
  const profileKey = useMemo(
    () => createTerminalDisplayProfileKey({ terminalFontSize, terminalFontFamily }),
    [terminalFontFamily, terminalFontSize],
  )
  const referenceSignature = useMemo(
    () => JSON.stringify(terminalDisplayReference ?? null),
    [terminalDisplayReference],
  )
  const [calibration, setCalibration] = useState(() =>
    readTerminalClientDisplayCalibration({
      terminalFontSize,
      terminalFontFamily,
      terminalDisplayReference,
    }),
  )

  useEffect(() => {
    const refresh = (): void => {
      setCalibration(current => {
        const next = readTerminalClientDisplayCalibration({
          terminalFontSize,
          terminalFontFamily,
          terminalDisplayReference,
        })

        return createTerminalDisplayCalibrationSignature(current) ===
          createTerminalDisplayCalibrationSignature(next)
          ? current
          : next
      })
    }
    refresh()
    window.addEventListener(CHANGE_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [
    profileKey,
    referenceSignature,
    terminalDisplayReference,
    terminalFontFamily,
    terminalFontSize,
  ])

  return calibration
}
