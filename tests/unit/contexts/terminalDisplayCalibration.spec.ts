import { beforeEach, describe, expect, it } from 'vitest'
import {
  createTerminalDisplayProfileKey,
  getTerminalDisplayCalibrationQuality,
  normalizeTerminalClientDisplayCalibration,
  normalizeTerminalDisplayReference,
  resolveTerminalDisplayCalibrationCompensation,
} from '../../../src/contexts/settings/domain/terminalDisplayCalibration'
import {
  clearTerminalClientDisplayCalibration,
  inspectTerminalClientDisplayCalibration,
  readTerminalClientDisplayCalibration,
  writeTerminalClientDisplayCalibration,
} from '../../../src/contexts/settings/presentation/renderer/terminalDisplayCalibrationStorage'
import { buildTerminalDisplayCalibrationCandidates } from '../../../src/contexts/settings/presentation/renderer/terminalDisplayMeasurement'

describe('terminal display calibration state', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('normalizes a shared reference measurement', () => {
    expect(
      normalizeTerminalDisplayReference({
        version: 1,
        measurement: {
          fontSize: 13,
          fontFamily: '',
          lineHeight: 1,
          letterSpacing: 0,
          cols: 81,
          rows: 24,
          cssCellWidth: 7.5,
          cssCellHeight: 15,
          effectiveDpr: 2,
          windowDevicePixelRatio: 1,
          visualViewportScale: 1,
          runtime: 'browser',
          measuredAt: '2026-04-29T00:00:00.000Z',
        },
      }),
    ).toMatchObject({
      version: 1,
      measurement: {
        fontFamily: null,
        cols: 81,
        rows: 24,
        runtime: 'browser',
      },
    })
  })

  it('maps engineering scores to user-facing match quality', () => {
    expect(getTerminalDisplayCalibrationQuality(0)).toBe('exact')
    expect(getTerminalDisplayCalibrationQuality(50)).toBe('close')
    expect(getTerminalDisplayCalibrationQuality(1000)).toBe('needsAdjustment')
    expect(getTerminalDisplayCalibrationQuality(Number.NaN)).toBe('needsAdjustment')
  })

  it('keeps display calibration candidates on the default terminal line height', () => {
    const candidates = buildTerminalDisplayCalibrationCandidates(13)

    expect(new Set(candidates.map(candidate => candidate.lineHeight))).toEqual(new Set([1]))
  })

  it('keeps saved display compensation gated by the user setting', () => {
    const calibration = normalizeTerminalClientDisplayCalibration({
      version: 1,
      profileKey: createTerminalDisplayProfileKey({
        terminalFontSize: 13,
        terminalFontFamily: null,
      }),
      fontSize: 12.5,
      lineHeight: 1,
      letterSpacing: 0,
      target: {
        cols: 81,
        rows: 24,
        cssCellWidth: 7.5,
        cssCellHeight: 15,
        effectiveDpr: 2,
      },
      measured: {
        cols: 78,
        rows: 23,
        cssCellWidth: 7.75,
        cssCellHeight: 15.5,
        effectiveDpr: 2,
      },
      score: 0,
      measuredAt: '2026-04-29T00:00:00.000Z',
    })

    expect(calibration).not.toBeNull()
    expect(calibration).toMatchObject({
      measured: {
        cols: 78,
        rows: 23,
        cssCellWidth: 7.75,
        cssCellHeight: 15.5,
        effectiveDpr: 2,
      },
    })
    expect(
      resolveTerminalDisplayCalibrationCompensation({
        calibration,
        compensationEnabled: true,
      }),
    ).toBe(calibration)
    expect(
      resolveTerminalDisplayCalibrationCompensation({
        calibration,
        compensationEnabled: false,
      }),
    ).toBeNull()
  })

  it('normalizes legacy saved display compensation back to the default line height', () => {
    const calibration = normalizeTerminalClientDisplayCalibration({
      version: 1,
      profileKey: createTerminalDisplayProfileKey({
        terminalFontSize: 13,
        terminalFontFamily: null,
      }),
      fontSize: 12.5,
      lineHeight: 1.1,
      letterSpacing: 0,
      target: {
        cols: 81,
        rows: 24,
        cssCellWidth: 7.5,
        cssCellHeight: 15,
        effectiveDpr: 2,
      },
      score: 0,
      measuredAt: '2026-04-29T00:00:00.000Z',
    })

    expect(calibration).toMatchObject({
      fontSize: 12.5,
      lineHeight: 1,
      letterSpacing: 0,
    })
  })

  it('keeps client calibration scoped to the matching terminal appearance profile', () => {
    const profileKey = createTerminalDisplayProfileKey({
      terminalFontSize: 13,
      terminalFontFamily: null,
    })
    const reference = normalizeTerminalDisplayReference({
      version: 1,
      measurement: {
        fontSize: 13,
        fontFamily: null,
        lineHeight: 1,
        letterSpacing: 0,
        cols: 81,
        rows: 24,
        cssCellWidth: 7.5,
        cssCellHeight: 15,
        effectiveDpr: 2,
        windowDevicePixelRatio: 1,
        visualViewportScale: 1,
        runtime: 'desktop',
        measuredAt: '2026-04-29T00:00:00.000Z',
      },
    })
    const calibration = normalizeTerminalClientDisplayCalibration({
      version: 1,
      profileKey,
      fontSize: 12.5,
      lineHeight: 1,
      letterSpacing: 0,
      target: {
        cols: 81,
        rows: 24,
        cssCellWidth: 7.5,
        cssCellHeight: 15,
        effectiveDpr: 2,
      },
      score: 0,
      measuredAt: '2026-04-29T00:00:00.000Z',
    })

    expect(calibration).not.toBeNull()
    expect(reference).not.toBeNull()
    writeTerminalClientDisplayCalibration(calibration!)

    expect(
      readTerminalClientDisplayCalibration({
        terminalFontSize: 13,
        terminalFontFamily: null,
        terminalDisplayReference: reference,
      }),
    ).toMatchObject({ fontSize: 12.5 })
    expect(
      readTerminalClientDisplayCalibration({
        terminalFontSize: 14,
        terminalFontFamily: null,
        terminalDisplayReference: reference,
      }),
    ).toBeNull()
    expect(
      readTerminalClientDisplayCalibration({
        terminalFontSize: 13,
        terminalFontFamily: null,
        terminalDisplayReference: null,
      }),
    ).toBeNull()
    expect(
      readTerminalClientDisplayCalibration({
        terminalFontSize: 13,
        terminalFontFamily: null,
        terminalDisplayReference: normalizeTerminalDisplayReference({
          version: 1,
          measurement: {
            ...reference!.measurement,
            cols: 80,
          },
        }),
      }),
    ).toBeNull()

    clearTerminalClientDisplayCalibration()
    expect(
      readTerminalClientDisplayCalibration({
        terminalFontSize: 13,
        terminalFontFamily: null,
        terminalDisplayReference: reference,
      }),
    ).toBeNull()
  })

  it('describes saved calibration even when it cannot apply without a reference', () => {
    const profileKey = createTerminalDisplayProfileKey({
      terminalFontSize: 13,
      terminalFontFamily: 'Consolas',
    })
    writeTerminalClientDisplayCalibration({
      version: 1,
      profileKey,
      fontSize: 12.5,
      lineHeight: 1,
      letterSpacing: 0,
      target: {
        cols: 81,
        rows: 24,
        cssCellWidth: 7.5,
        cssCellHeight: 15,
        effectiveDpr: 2,
      },
      score: 0,
      measuredAt: '2026-04-29T00:00:00.000Z',
    })

    expect(
      inspectTerminalClientDisplayCalibration({
        terminalFontSize: 13,
        terminalFontFamily: 'Consolas',
        terminalDisplayReference: null,
      }),
    ).toMatchObject({
      profileKey,
      rawCalibrationPresent: true,
      calibrationPresent: true,
      profileMatches: true,
      referencePresent: false,
      referenceMatchesProfile: false,
      calibrationMatchesReference: false,
      applicableCalibrationPresent: false,
      calibrationFontSize: 12.5,
      calibrationLineHeight: 1,
      calibrationLetterSpacing: 0,
      calibrationScore: 0,
    })
  })
})
