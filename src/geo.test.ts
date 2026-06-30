import { describe, expect, it } from 'vitest'
import {
  bearingAndDistance,
  clampLatitude,
  destinationPoint,
  mercatorScale,
  moveCountryFeature,
  unwrapLongitudeNear,
  wrapLongitude,
  removeLongSvgSegments,
  type CountryFeature,
} from './geo'

const squareFeature: CountryFeature = {
  type: 'Feature',
  properties: { name: 'Square' },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
        [-1, -1],
      ],
    ],
  },
}

describe('geo helpers', () => {
  it('round-trips a bearing and distance destination', () => {
    const origin: [number, number] = [12, 34]
    const target: [number, number] = [48, -11]
    const route = bearingAndDistance(origin, target)
    const result = destinationPoint(
      origin,
      route.bearing,
      route.angularDistance,
    )

    expect(result[0]).toBeCloseTo(target[0], 8)
    expect(result[1]).toBeCloseTo(target[1], 8)
  })

  it('moves country geometry around a new center', () => {
    const moved = moveCountryFeature(squareFeature, [0, 0], [30, 40])
    const first = moved.geometry.coordinates[0][0]

    expect(first[0]).toBeGreaterThan(28)
    expect(first[0]).toBeLessThan(30)
    expect(first[1]).toBeGreaterThan(38)
    expect(first[1]).toBeLessThan(40)
  })

  it('keeps longitudes wrapped and latitude inside the mercator guardrail', () => {
    expect(wrapLongitude(190)).toBe(-170)
    expect(wrapLongitude(-190)).toBe(170)
    expect(clampLatitude(86)).toBe(80)
    expect(clampLatitude(-86)).toBe(-80)
  })

  it('does not wrap moved geometry at the antimeridian', () => {
    const moved = moveCountryFeature(squareFeature, [0, 0], [179.5, 0])
    const longitudes = moved.geometry.coordinates[0].map(
      ([lng]) => lng as number,
    )

    expect(Math.max(...longitudes)).toBeGreaterThan(180)
    expect(Math.min(...longitudes)).toBeGreaterThan(170)
  })

  it('normalizes longitudes around the requested world copy', () => {
    expect(unwrapLongitudeNear(-179, 170)).toBe(181)
    expect(unwrapLongitudeNear(181, -170)).toBe(-179)
  })

  it('reports much larger mercator scale near high latitude', () => {
    expect(mercatorScale(0)).toBeCloseTo(1, 4)
    expect(mercatorScale(70)).toBeGreaterThan(2.9)
  })

  describe('removeLongSvgSegments', () => {
    it('preserves normal paths and closes with Z', () => {
      const path = 'M10,20L30,40Z'
      expect(removeLongSvgSegments(path, 1000)).toBe('M10,20L30,40Z')
    })

    it('splits segments crossing the wrap threshold', () => {
      // worldWidth = 1000 -> wrapThreshold = 800
      // segment from 10 to 850 exceeds threshold (dx = 840)
      const path = 'M10,20L850,20'
      expect(removeLongSvgSegments(path, 1000)).toBe('M10,20M850,20')
    })

    it('preserves Z in multi-polygon paths', () => {
      const path = 'M10,20L30,40ZM50,60L70,80Z'
      expect(removeLongSvgSegments(path, 1000)).toBe('M10,20L30,40ZM50,60L70,80Z')
    })
  })
})
