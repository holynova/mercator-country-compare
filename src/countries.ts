import { feature } from 'topojson-client'
import type { FeatureCollection, GeoJsonProperties, Position } from 'geojson'
import atlas from 'world-atlas/countries-110m.json'
import {
  getFeatureAreaKm2,
  getFeatureCenter,
  type CountryFeature,
  type CountryGeometry,
  type CountryRecord,
} from './geo'

type AtlasGeometry = {
  id: string
  properties: {
    name: string
  }
}

const COUNTRY_LABELS = new Map<string, string>([
  ['Russia', '俄罗斯'],
  ['China', '中国'],
  ['United States of America', '美国'],
  ['Canada', '加拿大'],
  ['Brazil', '巴西'],
  ['Australia', '澳大利亚'],
  ['India', '印度'],
  ['Argentina', '阿根廷'],
  ['Greenland', '格陵兰'],
  ['Dem. Rep. Congo', '刚果（金）'],
  ['Saudi Arabia', '沙特阿拉伯'],
  ['Mexico', '墨西哥'],
  ['Indonesia', '印度尼西亚'],
  ['South Africa', '南非'],
  ['Egypt', '埃及'],
  ['Algeria', '阿尔及利亚'],
  ['Sudan', '苏丹'],
  ['Kazakhstan', '哈萨克斯坦'],
  ['Mongolia', '蒙古'],
  ['Iran', '伊朗'],
  ['Peru', '秘鲁'],
  ['Niger', '尼日尔'],
  ['Mali', '马里'],
  ['Angola', '安哥拉'],
  ['Ethiopia', '埃塞俄比亚'],
  ['Bolivia', '玻利维亚'],
  ['Mauritania', '毛里塔尼亚'],
  ['Colombia', '哥伦比亚'],
  ['Spain', '西班牙'],
  ['France', '法国'],
  ['United Kingdom', '英国'],
  ['Germany', '德国'],
  ['Italy', '意大利'],
  ['Japan', '日本'],
  ['South Korea', '韩国'],
  ['Thailand', '泰国'],
  ['Vietnam', '越南'],
  ['New Zealand', '新西兰'],
  ['Chile', '智利'],
  ['Ukraine', '乌克兰'],
  ['Sweden', '瑞典'],
  ['Norway', '挪威'],
  ['Finland', '芬兰'],
  ['Madagascar', '马达加斯加'],
  ['Turkey', '土耳其'],
  ['Pakistan', '巴基斯坦'],
  ['Libya', '利比亚'],
  ['Chad', '乍得'],
  ['Somalia', '索马里'],
  ['Kenya', '肯尼亚'],
  ['Tanzania', '坦桑尼亚'],
  ['Nigeria', '尼日利亚'],
  ['Venezuela', '委内瑞拉'],
  ['Afghanistan', '阿富汗'],
  ['Yemen', '也门'],
  ['Iraq', '伊拉克'],
  ['Morocco', '摩洛哥'],
  ['Uzbekistan', '乌兹别克斯坦'],
  ['Poland', '波兰'],
  ['Philippines', '菲律宾'],
  ['Ecuador', '厄瓜多尔'],
  ['Iceland', '冰岛'],
  ['Cuba', '古巴'],
  ['Antarctica', '南极洲'],
  ['Western Europe', '西欧'],
  ['Africa', '非洲'],
])

const countryObjects = atlas.objects.countries as unknown as {
  type: 'GeometryCollection'
  geometries: AtlasGeometry[]
}

const worldFeatures = feature(
  atlas as never,
  countryObjects as never,
) as unknown as FeatureCollection<CountryGeometry, GeoJsonProperties>

// 将台湾几何合并到中国
const chinaFeature = worldFeatures.features.find(
  (f) => f.properties?.name === 'China',
) as CountryFeature | undefined

const taiwanFeature = worldFeatures.features.find(
  (f) => f.properties?.name === 'Taiwan',
) as CountryFeature | undefined

if (chinaFeature && taiwanFeature) {
  const chinaPolygons =
    chinaFeature.geometry.type === 'Polygon'
      ? [chinaFeature.geometry.coordinates]
      : chinaFeature.geometry.coordinates

  const taiwanPolygons =
    taiwanFeature.geometry.type === 'Polygon'
      ? [taiwanFeature.geometry.coordinates]
      : taiwanFeature.geometry.coordinates

  chinaFeature.geometry = {
    type: 'MultiPolygon',
    coordinates: [...chinaPolygons, ...taiwanPolygons],
  }

  // 移除单独的台湾要素，使其仅作为中国的一部分被选择和渲染
  worldFeatures.features = worldFeatures.features.filter(
    (f) => f.properties?.name !== 'Taiwan',
  )
}

export const WORLD_COUNTRY_COLLECTION = worldFeatures as FeatureCollection

const baseCountries: CountryRecord[] = worldFeatures.features
  .filter((item) => {
    const name = String(item.properties?.name || '')
    return name && name !== 'undefined'
  })
  .map((item) => {
    const typedFeature = item as CountryFeature
    const sourceName = String(typedFeature.properties?.name || 'Unknown')

    return {
      id: sourceName.toLowerCase().replaceAll(/\W+/g, '-'),
      sourceName,
      nameZh: COUNTRY_LABELS.get(sourceName) ?? sourceName,
      feature: typedFeature,
      center: getFeatureCenter(typedFeature),
      areaKm2: getFeatureAreaKm2(typedFeature),
    }
  })
  .filter((country) => {
    return country.center && !isNaN(country.center[0]) && !isNaN(country.center[1])
  })

const WEST_EUROPE_COUNTRIES = [
  'France', 'Germany', 'Spain', 'Italy', 'United Kingdom', 'Belgium', 'Netherlands', 'Switzerland', 'Austria', 'Portugal', 'Ireland', 'Luxembourg'
]

const AFRICA_COUNTRIES = [
  'Algeria', 'Angola', 'Benin', 'Botswana', 'Burkina Faso', 'Burundi', 'Cameroon', 'Central African Rep.',
  'Chad', 'Congo', "Côte d'Ivoire", 'Dem. Rep. Congo', 'Djibouti', 'Egypt', 'Eq. Guinea', 'Eritrea',
  'Ethiopia', 'Gabon', 'Gambia', 'Ghana', 'Guinea', 'Guinea-Bissau', 'Kenya', 'Lesotho', 'Liberia',
  'Libya', 'Madagascar', 'Malawi', 'Mali', 'Mauritania', 'Morocco', 'Mozambique', 'Namibia', 'Niger',
  'Nigeria', 'Rwanda', 'Senegal', 'Sierra Leone', 'Somalia', 'South Africa', 'S. Sudan', 'Sudan',
  'eSwatini', 'Tanzania', 'Togo', 'Tunisia', 'Uganda', 'W. Sahara', 'Zambia', 'Zimbabwe', 'Somaliland'
]

function buildVirtualRegion(regionName: string, countryNames: string[]): CountryRecord | null {
  const matchingRecords = baseCountries.filter(c => countryNames.includes(c.sourceName))
  if (matchingRecords.length === 0) return null

  const polygons: Position[][][] = []
  matchingRecords.forEach(r => {
    const f = r.feature
    if (f.geometry.type === 'Polygon') {
      polygons.push(f.geometry.coordinates)
    } else if (f.geometry.type === 'MultiPolygon') {
      polygons.push(...f.geometry.coordinates)
    }
  })

  const mergedFeature: CountryFeature = {
    type: 'Feature',
    properties: { name: regionName },
    geometry: {
      type: 'MultiPolygon',
      coordinates: polygons
    }
  }

  const id = regionName.toLowerCase().replaceAll(/\W+/g, '-')
  const nameZh = COUNTRY_LABELS.get(regionName) ?? regionName

  return {
    id,
    sourceName: regionName,
    nameZh,
    feature: mergedFeature,
    center: getFeatureCenter(mergedFeature),
    areaKm2: matchingRecords.reduce((sum, r) => sum + r.areaKm2, 0)
  }
}

const westEuropeRegion = buildVirtualRegion('Western Europe', WEST_EUROPE_COUNTRIES)
const africaRegion = buildVirtualRegion('Africa', AFRICA_COUNTRIES)

const combinedCountries = [...baseCountries]
if (westEuropeRegion) combinedCountries.push(westEuropeRegion)
if (africaRegion) combinedCountries.push(africaRegion)

export const COUNTRIES: CountryRecord[] = combinedCountries
  .sort((a, b) => a.nameZh.localeCompare(b.nameZh, 'zh-CN'))

export const DEFAULT_COUNTRY_ID =
  COUNTRIES.find((country) => country.sourceName === 'China')?.id ??
  COUNTRIES.find((country) => country.sourceName === 'Russia')?.id ??
  COUNTRIES[0]?.id
