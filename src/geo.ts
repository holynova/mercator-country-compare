import { geoArea, geoCentroid } from 'd3-geo'
import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
  MultiPolygon,
  Polygon,
  Position,
} from 'geojson'

const EARTH_RADIUS_KM = 6371.0088
const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI
const MAX_CENTER_LAT = 80
const MAX_GEOMETRY_LAT = 85.05112878

export type CountryGeometry = Polygon | MultiPolygon
export type CountryFeature = Feature<CountryGeometry, GeoJsonProperties>

export type CountryRecord = {
  id: string
  sourceName: string
  nameZh: string
  feature: CountryFeature
  center: [number, number]
  areaKm2: number
}

export function clampLatitude(latitude: number) {
  return Math.max(-MAX_CENTER_LAT, Math.min(MAX_CENTER_LAT, latitude))
}

export function clampGeometryLatitude(latitude: number) {
  return Math.max(-MAX_GEOMETRY_LAT, Math.min(MAX_GEOMETRY_LAT, latitude))
}

export function wrapLongitude(longitude: number) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180
}

export function unwrapLongitudeNear(longitude: number, reference: number) {
  return longitude + Math.round((reference - longitude) / 360) * 360
}

export function mercatorScale(latitude: number) {
  const radians = clampLatitude(latitude) * DEG_TO_RAD
  return 1 / Math.max(0.001, Math.cos(radians))
}

export function formatArea(areaKm2: number) {
  if (areaKm2 >= 1_000_000) {
    return `${(areaKm2 / 1_000_000).toFixed(2)} 百万 km²`
  }

  return `${Math.round(areaKm2).toLocaleString('zh-CN')} km²`
}

export function formatCoordinate(value: number, suffix: 'lat' | 'lng') {
  const direction =
    suffix === 'lat' ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W'

  return `${Math.abs(value).toFixed(2)}°${direction}`
}

export function getFeatureCenter(feature: CountryFeature): [number, number] {
  const [lng, lat] = geoCentroid(feature)
  return [wrapLongitude(lng), clampLatitude(lat)]
}

export function getFeatureAreaKm2(feature: CountryFeature) {
  return geoArea(feature) * EARTH_RADIUS_KM * EARTH_RADIUS_KM
}

export function bearingAndDistance(
  from: [number, number],
  to: [number, number],
) {
  const phi1 = from[1] * DEG_TO_RAD
  const phi2 = to[1] * DEG_TO_RAD
  const deltaPhi = (to[1] - from[1]) * DEG_TO_RAD
  const deltaLambda = (to[0] - from[0]) * DEG_TO_RAD

  const sinHalfPhi = Math.sin(deltaPhi / 2)
  const sinHalfLambda = Math.sin(deltaLambda / 2)
  const a =
    sinHalfPhi * sinHalfPhi +
    Math.cos(phi1) * Math.cos(phi2) * sinHalfLambda * sinHalfLambda
  const angularDistance = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  const y = Math.sin(deltaLambda) * Math.cos(phi2)
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda)

  return {
    bearing: Math.atan2(y, x),
    angularDistance,
  }
}

export function destinationPoint(
  from: [number, number],
  bearing: number,
  angularDistance: number,
): [number, number] {
  const phi1 = from[1] * DEG_TO_RAD
  const lambda1 = from[0] * DEG_TO_RAD
  const sinPhi1 = Math.sin(phi1)
  const cosPhi1 = Math.cos(phi1)
  const sinDistance = Math.sin(angularDistance)
  const cosDistance = Math.cos(angularDistance)

  const phi2 = Math.asin(
    sinPhi1 * cosDistance +
      cosPhi1 * sinDistance * Math.cos(bearing),
  )
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(bearing) * sinDistance * cosPhi1,
      cosDistance - sinPhi1 * Math.sin(phi2),
    )

  return [lambda2 * RAD_TO_DEG, clampGeometryLatitude(phi2 * RAD_TO_DEG)]
}

function movePosition(
  originalCenter: [number, number],
  targetCenter: [number, number],
  position: Position,
): Position {
  const { bearing, angularDistance } = bearingAndDistance(originalCenter, [
    position[0],
    position[1],
  ])
  const dest = destinationPoint(targetCenter, bearing, angularDistance)
  return [dest[0], dest[1]]
}

function normalizeRing(ring: Position[], referenceLongitude: number) {
  let previousLongitude = referenceLongitude

  return ring.map((position) => {
    const longitude = unwrapLongitudeNear(position[0], previousLongitude)
    previousLongitude = longitude
    return [longitude, position[1]] satisfies Position
  })
}

function closeRing(ring: Position[]) {
  if (ring.length < 2) return ring

  const first = ring[0]
  const last = ring[ring.length - 1]
  const firstInput = [first[0], first[1]]

  if (firstInput[0] === last[0] && firstInput[1] === last[1]) {
    return ring
  }

  return [...ring.slice(0, -1), firstInput]
}


function movePolygonCoordinates(
  originalCenter: [number, number],
  targetCenter: [number, number],
  coordinates: Position[][],
) {
  return coordinates.map((ring) => {
    const normalizedRing = normalizeRing(ring, originalCenter[0])
    let previousMovedLongitude = targetCenter[0]
    const movedRing = normalizedRing.map((position) => {
      const moved = movePosition(originalCenter, targetCenter, position)
      const movedLongitude = unwrapLongitudeNear(
        moved[0],
        previousMovedLongitude,
      )
      previousMovedLongitude = movedLongitude
      return [movedLongitude, moved[1]] satisfies Position
    })

    return closeRing(movedRing)
  })
}

export function moveCountryFeature(
  feature: CountryFeature,
  originalCenter: [number, number],
  targetCenter: [number, number],
): CountryFeature {
  const clampedTarget: [number, number] = [
    wrapLongitude(targetCenter[0]),
    clampLatitude(targetCenter[1]),
  ]

  if (feature.geometry.type === 'Polygon') {
    return {
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: movePolygonCoordinates(
          originalCenter,
          clampedTarget,
          feature.geometry.coordinates,
        ),
      },
    }
  }

  return {
    ...feature,
    geometry: {
      ...feature.geometry,
      coordinates: feature.geometry.coordinates.map((polygon) =>
        movePolygonCoordinates(originalCenter, clampedTarget, polygon),
      ),
    },
  }
}

export function emptyFeatureCollection(): FeatureCollection<Geometry> {
  return {
    type: 'FeatureCollection',
    features: [],
  }
}

export function singleFeatureCollection(
  feature: CountryFeature,
): FeatureCollection<CountryGeometry> {
  return {
    type: 'FeatureCollection',
    features: [feature],
  }
}
