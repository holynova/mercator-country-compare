import { feature } from 'topojson-client'
import type { FeatureCollection } from 'geojson'
import atlas from 'world-atlas/countries-110m.json'
import {
  getFeatureAreaKm2,
  getFeatureCenter,
  type CountryFeature,
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
])

const countryObjects = atlas.objects.countries as unknown as {
  type: 'GeometryCollection'
  geometries: AtlasGeometry[]
}

const worldFeatures = feature(
  atlas as never,
  countryObjects as never,
) as unknown as FeatureCollection

export const WORLD_COUNTRY_COLLECTION = worldFeatures as FeatureCollection

export const COUNTRIES: CountryRecord[] = worldFeatures.features
  .filter((item) => {
    const name = String(item.properties?.name || '')
    return name && name !== 'Antarctica' && name !== 'undefined'
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
  .sort((a, b) => a.nameZh.localeCompare(b.nameZh, 'zh-CN'))

export const DEFAULT_COUNTRY_ID =
  COUNTRIES.find((country) => country.sourceName === 'China')?.id ??
  COUNTRIES.find((country) => country.sourceName === 'Russia')?.id ??
  COUNTRIES[0]?.id
