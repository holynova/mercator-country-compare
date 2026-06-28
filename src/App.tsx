import {
  geoMercator,
  geoPath,
  geoGraticule,
  type GeoProjection,
  type GeoPermissibleObjects,
} from 'd3-geo'
import {
  ArrowsClockwise,
  Crosshair,
  Eye,
  EyeSlash,
  MapPin,
  Trash,
  Info,
  GithubLogo,
  CaretLeft,
  CaretRight,
} from '@phosphor-icons/react'
import maplibregl, {
  type LngLatLike,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useMemo, useRef, useState, memo, type PointerEvent } from 'react'
import './App.css'
import {
  COUNTRIES,
  WORLD_COUNTRY_COLLECTION,
} from './countries'
import {
  clampLatitude,
  moveCountryFeature,
  wrapLongitude,
  type CountryFeature,
} from './geo'

const BASE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'paper',
      type: 'background',
      paint: {
        'background-color': '#b4c3c7',
      },
    },
  ],
}

const INITIAL_CENTER: LngLatLike = [30, 20]
const INITIAL_ZOOM = 1.7
const DEFAULT_OPACITY = 0.55
const DEFAULT_SHOW_OUTLINE = true

const COLOR_PALETTE = [
  '#ec3f91', // Vibrant Pink/Magenta
  '#3b82f6', // Electric Blue
  '#10b981', // Emerald Green
  '#f59e0b', // Amber/Yellow
  '#8b5cf6', // Violet/Purple
  '#ef4444', // Coral Red
  '#06b6d4', // Bright Cyan
  '#f97316', // Orange
]

type MapStyle = 'dark' | 'light' | 'voyager' | 'minimal'

const MAP_STYLE_SPECS: Record<MapStyle, string | maplibregl.StyleSpecification> = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  voyager: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  minimal: BASE_STYLE,
}

interface ActiveCountry {
  instanceId: string
  countryId: string
  nameZh: string
  sourceName: string
  color: string
  currentCenter: [number, number]
  originalCenter: [number, number]
  feature: CountryFeature
  areaKm2: number
}

interface Preset {
  nameZh: string
  nameEn: string
  descZh: string
  descEn: string
  countries: Array<{
    countryName: string
    customCenter?: [number, number]
  }>
}

const PRESETS: Preset[] = [
  {
    nameZh: '赤道大缩小 (Equator Shrink)',
    nameEn: 'Equator Shrink',
    descZh: '将高纬度大国（格陵兰、俄罗斯、加拿大）拖到赤道，看看它们的真实大小。',
    descEn: 'Drag high-latitude landmasses (Greenland, Russia, Canada) to the equator to see their true sizes.',
    countries: [
      { countryName: 'Greenland', customCenter: [-40, 0] },
      { countryName: 'Russia', customCenter: [20, 0] },
      { countryName: 'Canada', customCenter: [-100, 0] },
    ],
  },
  {
    nameZh: '中美横向对比 (China vs. USA)',
    nameEn: 'China vs. USA',
    descZh: '将美国平移到中国所在的纬度并排对比，观察两者真实的版图比例大小。',
    descEn: 'Translate the USA to China\'s latitude for side-by-side comparison, observing their true proportions.',
    countries: [
      { countryName: 'China' },
      { countryName: 'United States of America', customCenter: [60, 36.6] },
    ],
  },
  {
    nameZh: '非洲有多大 (True Size of Africa)',
    nameEn: 'True Size of Africa',
    descZh: '将中国、美国、英国、法国、德国等并排放入非洲，感受非洲大陆极其辽阔的真实面积。',
    descEn: 'Place China, USA, UK, France, Germany, etc. side-by-side into Africa to grasp the immense scale of the African continent.',
    countries: [
      { countryName: 'China', customCenter: [26, -3] },
      { countryName: 'United States of America', customCenter: [13, -15] },
      { countryName: 'France', customCenter: [12, 18] },
      { countryName: 'Germany', customCenter: [22, 20] },
      { countryName: 'United Kingdom', customCenter: [31, 22] },
      { countryName: 'Japan', customCenter: [26, -26] },
    ],
  },
  {
    nameZh: '格陵兰有多大 (Size of Greenland)',
    nameEn: 'Size of Greenland',
    descZh: '将格陵兰、中国、美国、巴西放在赤道并排对比，观察格陵兰真实的版图大小。',
    descEn: 'Compare Greenland, China, USA, and Brazil side-by-side at the equator to reveal Greenland\'s true proportions.',
    countries: [
      { countryName: 'Greenland', customCenter: [-15, 0] },
      { countryName: 'China', customCenter: [10, 0] },
      { countryName: 'United States of America', customCenter: [-35, 0] },
      { countryName: 'Brazil', customCenter: [-55, -5] },
    ],
  },
  {
    nameZh: '南极有多大 (Size of Antarctica)',
    nameEn: 'Size of Antarctica',
    descZh: '将南极洲、俄罗斯、中国、非洲在赤道并排对比，揭示南极洲真实的陆地占比。',
    descEn: 'Compare Antarctica, Russia, China, and Africa side-by-side at the equator to reveal Antarctica\'s true relative area.',
    countries: [
      { countryName: 'Antarctica', customCenter: [-10, 0] },
      { countryName: 'Russia', customCenter: [25, 0] },
      { countryName: 'China', customCenter: [50, 0] },
      { countryName: 'Africa', customCenter: [-50, 0] },
    ],
  },
  {
    nameZh: '全球六大领土国 (Six Giants)',
    nameEn: 'Six Giants',
    descZh: '展示世界领土前六大国家在它们原产地的位置及实际投影比例。',
    descEn: 'Showcase the top six largest countries in their original positions and actual Mercator projections.',
    countries: [
      { countryName: 'Russia' },
      { countryName: 'Canada' },
      { countryName: 'China' },
      { countryName: 'United States of America' },
      { countryName: 'Brazil' },
      { countryName: 'Australia' },
    ],
  },
]

const t = {
  zh: {
    title: '地图投影形变实验室',
    searchPlaceholder: '中/英文搜索世界国家...',
    searchResults: '搜索结果',
    continentsRegions: '大洲与区域',
    recommendedCountries: '推荐国家',
    noResults: '未找到匹配的国家',
    compareBoardTitle: '对比管理看板',
    emptyBoard: '暂无对比国家。请在上方选择或搜索添加',
    clearBoard: '清空对比看板',
    locate: '定位',
    reset: '重置',
    delete: '删除',
    advancedSettings: '高级显示设置',
    outlineOpacity: '轮廓不透明度',
    hideOutline: '隐藏描边',
    showOutline: '显示描边',
    hideGrid: '隐藏参考线',
    showGrid: '显示参考线',
    resetAll: '全部归位',
    presetTitle: '经典对比场景预设',
    note: '国家真实面积不变。基于大圆航线球面平移，将国家往赤道拖动，经纬度方向会以相同比例收缩，无形变畸变。',
    maxLimit: '添加对比国家 (最多8个)',
    hidePanel: '隐藏控制台',
    showPanel: '展开控制台',
    mapStyle: '地图样式',
    styleColor: '彩色',
    styleDark: '暗黑',
    styleLight: '明亮',
    styleOffline: '离线',
  },
  en: {
    title: 'Mercator Lab',
    searchPlaceholder: 'Search countries or continents...',
    searchResults: 'Search Results',
    continentsRegions: 'Continents & Regions',
    recommendedCountries: 'Recommended Countries',
    noResults: 'No matching countries found',
    compareBoardTitle: 'Compare Control Board',
    emptyBoard: 'No countries added. Search or select above to add.',
    clearBoard: 'Clear Compare Board',
    locate: 'Locate',
    reset: 'Reset',
    delete: 'Delete',
    advancedSettings: 'Advanced Display Settings',
    outlineOpacity: 'Outline Opacity',
    hideOutline: 'Hide Outline',
    showOutline: 'Show Outline',
    hideGrid: 'Hide Grid Lines',
    showGrid: 'Show Grid Lines',
    resetAll: 'Reset All Positions',
    presetTitle: 'Scenario Presets',
    note: 'True country sizes remain unchanged. Based on great-circle spherical translation, moving countries towards the equator shrinks them isotropically along both latitude and longitude lines, preserving shape without distortion.',
    maxLimit: 'Add Countries (Max 8)',
    hidePanel: 'Hide Panel',
    showPanel: 'Show Panel',
    mapStyle: 'Map Style',
    styleColor: 'Color',
    styleDark: 'Dark',
    styleLight: 'Light',
    styleOffline: 'Offline',
  }
}

function projectCountryPath(
  map: maplibregl.Map,
  feature: ReturnType<typeof moveCountryFeature>,
) {
  const container = map.getContainer()
  const center = map.getCenter()
  const zoom = map.getZoom()
  const worldWidth = 512 * Math.pow(2, zoom)
  const scale = worldWidth / (2 * Math.PI)
  const projection = geoMercator()
    .scale(scale)
    .translate([container.clientWidth / 2, container.clientHeight / 2])
    .center([center.lng, center.lat])
    .clipAngle(180) as GeoProjection

  return removeLongSvgSegments(
    geoPath(projection)(feature as GeoPermissibleObjects) ?? '',
    worldWidth,
  )
}

function removeLongSvgSegments(pathData: string, worldWidth: number) {
  // Only split segments that are wrap-around jumps (horizontal distance close to world width)
  const wrapThreshold = worldWidth * 0.8
  const commands = pathData.match(/[ML][^MLZ]+|Z/g) ?? []
  let previous: [number, number] | null = null

  return commands
    .map((command) => {
      if (command === 'Z') {
        previous = null
        return ''
      }

      const type = command[0]
      const [x, y] = command
        .slice(1)
        .split(',')
        .map((value) => Number(value)) as [number, number]

      if (!Number.isFinite(x) || !Number.isFinite(y)) return ''

      if (type === 'M' || !previous) {
        previous = [x, y]
        return `M${x},${y}`
      }

      const dx = Math.abs(x - previous[0])
      previous = [x, y]

      return `${dx > wrapThreshold ? 'M' : 'L'}${x},${y}`
    })
    .filter(Boolean)
    .join('')
}

interface CountryOverlayPathProps {
  map: maplibregl.Map
  country: ActiveCountry
  opacity: number
  showOutline: boolean
  onDragStart: (event: PointerEvent<SVGPathElement>, instanceId: string) => void
  mapRenderTick: number
}

const CountryOverlayPath = memo(({
  map,
  country,
  opacity,
  showOutline,
  onDragStart,
  mapRenderTick,
}: CountryOverlayPathProps) => {
  const originalPath = useMemo(() => {
    return projectCountryPath(map, country.feature)
  }, [map, country.feature, mapRenderTick])

  const movedPath = useMemo(() => {
    const movedFeature = moveCountryFeature(
      country.feature,
      country.originalCenter,
      country.currentCenter,
    )
    return projectCountryPath(map, movedFeature)
  }, [map, country.feature, country.originalCenter, country.currentCenter, mapRenderTick])

  return (
    <g>
      {originalPath && (
        <path
          d={originalPath}
          className="country-overlay-path-original"
          style={{
            stroke: country.color,
          }}
        />
      )}
      {movedPath && (
        <path
          d={movedPath}
          className="country-overlay-path-dragged"
          style={{
            fill: country.color,
            stroke: country.color,
            fillOpacity: opacity,
            strokeOpacity: showOutline ? 1 : 0,
            '--glow-color': country.color,
          } as React.CSSProperties}
          onPointerDown={(e) => onDragStart(e, country.instanceId)}
        />
      )}
    </g>
  )
})

function App() {
  const mapNodeRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const dragCleanupRef = useRef<(() => void) | null>(null)
  const currentStyleRef = useRef<MapStyle>('voyager')

  const [activeCountries, setActiveCountries] = useState<ActiveCountry[]>(() => {
    const defaultCountry = COUNTRIES.find((c) => c.sourceName === 'China') ?? COUNTRIES[0]
    if (!defaultCountry) return []
    return [
      {
        instanceId: `${defaultCountry.id}-default`,
        countryId: defaultCountry.id,
        nameZh: defaultCountry.nameZh,
        sourceName: defaultCountry.sourceName,
        color: COLOR_PALETTE[0],
        currentCenter: [...defaultCountry.center] as [number, number],
        originalCenter: [...defaultCountry.center] as [number, number],
        feature: defaultCountry.feature,
        areaKm2: defaultCountry.areaKm2,
      },
    ]
  })

  const [draggingInstanceId, setDraggingInstanceId] = useState<string | null>(null)
  const [mapStyle, setMapStyle] = useState<MapStyle>('voyager')
  const [searchQuery, setSearchQuery] = useState('')
  const [opacity, setOpacity] = useState(DEFAULT_OPACITY)
  const [showOutline, setShowOutline] = useState(DEFAULT_SHOW_OUTLINE)
  const [showGraticule, setShowGraticule] = useState(true)
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false)
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false)
  const [mapRenderTick, setMapRenderTick] = useState(0)
  const [lang, setLang] = useState<'zh' | 'en'>(() => {
    const saved = localStorage.getItem('app-lang')
    return (saved === 'zh' || saved === 'en') ? saved : 'zh'
  })

  // Sync lang state to localStorage
  useEffect(() => {
    localStorage.setItem('app-lang', lang)
  }, [lang])

  // Track style in ref to use in events
  useEffect(() => {
    currentStyleRef.current = mapStyle
  }, [mapStyle])

  // Apply graticule lines visibility
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    const visibility = showGraticule ? 'visible' : 'none'
    if (map.getLayer('graticule-lines')) {
      map.setLayoutProperty('graticule-lines', 'visibility', visibility)
    }
    if (map.getLayer('equator-line')) {
      map.setLayoutProperty('equator-line', 'visibility', visibility)
    }
  }, [showGraticule, mapRenderTick])

  // Memoize search/filter results
  const regionsList = useMemo(() => {
    const regionNames = ['Western Europe', 'Africa', 'Antarctica']
    return COUNTRIES.filter((c) => regionNames.includes(c.sourceName))
  }, [])

  const recommendedCountriesList = useMemo(() => {
    const countryNames = [
      'China',
      'United States of America',
      'Russia',
      'Greenland',
      'Canada',
      'Brazil',
      'Australia',
      'India',
      'Japan',
      'United Kingdom',
      'France',
      'Germany',
    ]
    return COUNTRIES.filter((c) => countryNames.includes(c.sourceName))
  }, [])

  const filteredCountries = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    if (!query) return []
    return COUNTRIES.filter(
      (c) =>
        c.nameZh.toLowerCase().includes(query) ||
        c.sourceName.toLowerCase().includes(query),
    )
  }, [searchQuery])

  // Initialize MapLibre
  useEffect(() => {
    if (!mapNodeRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: mapNodeRef.current,
      style: MAP_STYLE_SPECS[mapStyle],
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      minZoom: 1,
      maxZoom: 9,
      maxBounds: [
        [-179.9, -82],
        [179.9, 82],
      ],
      attributionControl: false,
    })

    map.addControl(
      new maplibregl.NavigationControl({
        visualizePitch: false,
        showCompass: false,
      }),
      'bottom-left',
    )

    const handleStyleLoad = () => {
      const currentStyle = currentStyleRef.current
      if (currentStyle === 'minimal') {
        if (!map.getSource('world-countries')) {
          map.addSource('world-countries', {
            type: 'geojson',
            data: WORLD_COUNTRY_COLLECTION,
          })
        }

        if (!map.getLayer('world-countries-fill')) {
          map.addLayer(
            {
              id: 'world-countries-fill',
              type: 'fill',
              source: 'world-countries',
              paint: {
                'fill-color': '#e2e8f0', // Clean land
                'fill-opacity': 1,
              },
            },
            'paper',
          )
        }

        if (!map.getLayer('world-countries-border')) {
          map.addLayer({
            id: 'world-countries-border',
            type: 'line',
            source: 'world-countries',
            paint: {
              'line-color': '#94a3b8', // Gray borders
              'line-width': 0.8,
            },
          })
        }
      }

      // Add graticule and equator lines for visual reference
      if (!map.getSource('graticule')) {
        map.addSource('graticule', {
          type: 'geojson',
          data: geoGraticule()(),
        })
      }

      if (!map.getSource('equator')) {
        map.addSource('equator', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [-180, 0],
                [180, 0],
              ],
            },
            properties: {},
          },
        })
      }

      if (!map.getLayer('graticule-lines')) {
        map.addLayer({
          id: 'graticule-lines',
          type: 'line',
          source: 'graticule',
          paint: {
            'line-color': '#64748b',
            'line-opacity': 0.15,
            'line-width': 0.6,
            'line-dasharray': [4, 4],
          },
        })
      }

      if (!map.getLayer('equator-line')) {
        map.addLayer({
          id: 'equator-line',
          type: 'line',
          source: 'equator',
          paint: {
            'line-color': '#ea580c',
            'line-opacity': 0.45,
            'line-width': 1.2,
            'line-dasharray': [6, 4],
          },
        })
      }
    }

    map.on('load', () => {
      map.getCanvas().style.cursor = 'grab'
      setMapRenderTick((value) => value + 1)
    })

    map.on('style.load', handleStyleLoad)

    const requestOverlayRender = () => {
      setMapRenderTick((value) => value + 1)
    }

    map.on('move', requestOverlayRender)
    map.on('zoom', requestOverlayRender)
    map.on('resize', requestOverlayRender)

    mapRef.current = map

    return () => {
      dragCleanupRef.current?.()
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Handle Map Style changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.setStyle(MAP_STYLE_SPECS[mapStyle])
  }, [mapStyle])

  // Trigger path updates on change of active countries
  useEffect(() => {
    setMapRenderTick((value) => value + 1)
  }, [activeCountries])

  // Add country comparison instance
  function addCountry(countryId: string) {
    if (activeCountries.length >= 8) {
      alert('为了确保渲染性能和视觉清晰度，最多只能同时对比 8 个国家。')
      return
    }

    const country = COUNTRIES.find((item) => item.id === countryId)
    if (!country) return

    const instanceId = `${country.id}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`
    const color = COLOR_PALETTE[activeCountries.length % COLOR_PALETTE.length]

    const newItem: ActiveCountry = {
      instanceId,
      countryId: country.id,
      nameZh: country.nameZh,
      sourceName: country.sourceName,
      color,
      currentCenter: [...country.center] as [number, number],
      originalCenter: [...country.center] as [number, number],
      feature: country.feature,
      areaKm2: country.areaKm2,
    }

    setActiveCountries((prev) => [...prev, newItem])

    // Fly map to show the newly added country
    mapRef.current?.flyTo({
      center: country.center,
      zoom: Math.max(INITIAL_ZOOM + 0.5, mapRef.current?.getZoom() ?? INITIAL_ZOOM),
      duration: 600,
    })
  }

  // Remove country comparison instance
  function removeCountry(instanceId: string) {
    setActiveCountries((prev) => prev.filter((item) => item.instanceId !== instanceId))
  }

  // Focus map on a country
  function zoomToCountry(instanceId: string) {
    const item = activeCountries.find((c) => c.instanceId === instanceId)
    const map = mapRef.current
    if (!item || !map) return

    map.flyTo({
      center: item.currentCenter,
      zoom: 3.5,
      duration: 800,
    })
  }

  // Reset a country's center back to original
  function resetCountryCenter(instanceId: string) {
    setActiveCountries((prev) =>
      prev.map((item) =>
        item.instanceId === instanceId
          ? { ...item, currentCenter: [...item.originalCenter] }
          : item
      ),
    )
  }

  // Reset all active countries to original centers
  function resetAllCountryCenters() {
    setActiveCountries((prev) =>
      prev.map((item) => ({
        ...item,
        currentCenter: [...item.originalCenter],
      })),
    )
  }

  // Clear all countries in comparison list
  function clearAllCountries() {
    setActiveCountries([])
  }

  // Load a preset scenario
  function loadPreset(preset: Preset) {
    const newItems: ActiveCountry[] = []

    preset.countries.forEach((presetItem, index) => {
      const country = COUNTRIES.find((c) => c.sourceName === presetItem.countryName)
      if (!country) return

      const instanceId = `${country.id}-${Date.now()}-${index}`
      const color = COLOR_PALETTE[index % COLOR_PALETTE.length]

      newItems.push({
        instanceId,
        countryId: country.id,
        nameZh: country.nameZh,
        sourceName: country.sourceName,
        color,
        currentCenter: presetItem.customCenter ?? ([...country.center] as [number, number]),
        originalCenter: [...country.center] as [number, number],
        feature: country.feature,
        areaKm2: country.areaKm2,
      })
    })

    setActiveCountries(newItems)

    const map = mapRef.current
    if (map) {
      if (preset.nameZh.includes('中美')) {
        map.flyTo({ center: [80, 32], zoom: 2.3, duration: 800 })
      } else if (preset.nameZh.includes('赤道')) {
        map.flyTo({ center: [-10, 15], zoom: 1.8, duration: 800 })
      } else if (preset.nameZh.includes('非洲')) {
        map.flyTo({ center: [20, 0], zoom: 2.1, duration: 800 })
      } else if (preset.nameZh.includes('格陵兰')) {
        map.flyTo({ center: [-15, -2], zoom: 1.9, duration: 800 })
      } else if (preset.nameZh.includes('南极')) {
        map.flyTo({ center: [0, 0], zoom: 1.8, duration: 800 })
      } else {
        map.flyTo({ center: [10, 10], zoom: 1.6, duration: 800 })
      }
    }
  }

  // Update country coordinates during drag
  function updateCenterFromPointer(event: globalThis.PointerEvent, instanceId: string) {
    const map = mapRef.current
    if (!map || !mapNodeRef.current) return

    const rect = mapNodeRef.current.getBoundingClientRect()
    const lngLat = map.unproject([event.clientX - rect.left, event.clientY - rect.top])
    setActiveCountries((prev) =>
      prev.map((item) =>
        item.instanceId === instanceId
          ? {
              ...item,
              currentCenter: [wrapLongitude(lngLat.lng), clampLatitude(lngLat.lat)],
            }
          : item
      ),
    )
  }

  // Drag handler for SVG overlay path
  function startOverlayDrag(event: PointerEvent<SVGPathElement>, instanceId: string) {
    const map = mapRef.current
    if (!map) return

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDraggingInstanceId(instanceId)
    map.dragPan.disable()
    map.getCanvas().style.cursor = 'grabbing'

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      updateCenterFromPointer(moveEvent, instanceId)
    }

    const handleEnd = () => {
      setDraggingInstanceId(null)
      map.dragPan.enable()
      map.getCanvas().style.cursor = 'grab'
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleEnd)
      window.removeEventListener('pointercancel', handleEnd)
      dragCleanupRef.current = null
    }

    dragCleanupRef.current = handleEnd
    updateCenterFromPointer(event.nativeEvent, instanceId)
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleEnd)
    window.addEventListener('pointercancel', handleEnd)
  }

  return (
    <main className="app-shell">
      {/* 收纳侧边栏面板 */}
      <aside className={`panel ${isPanelCollapsed ? 'collapsed' : ''}`} aria-label="地图投影工具控制面板">
        {/* 面板内折叠收起按钮 */}
        <button
          type="button"
          className="panel-toggle-btn-inside"
          onClick={() => setIsPanelCollapsed(true)}
          title="收起控制面板"
        >
          <CaretRight size={16} weight="bold" />
        </button>

        <div className="brand-block">
          <p className="eyebrow">Mercator Lab</p>
          <h1>{t[lang].title}</h1>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
            <a
              href="https://github.com/holynova/mercator-country-compare"
              target="_blank"
              rel="noopener noreferrer"
              className="github-repo-link"
            >
              <GithubLogo size={12} weight="bold" />
              GitHub Repository
            </a>
            <button
              type="button"
              className="lang-toggle-btn"
              onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
              title={lang === 'zh' ? 'Switch to English' : '切换至中文'}
            >
              {lang === 'zh' ? 'EN' : '中文'}
            </button>
          </div>
        </div>

        {/* 预设演示区域 */}
        <section className="presets-section" aria-label="经典演示预设">
          <div className="section-label">{t[lang].presetTitle}</div>
          <div className="presets-pills">
            {PRESETS.map((preset, index) => {
              const name = lang === 'zh' ? preset.nameZh : preset.nameEn
              const shortName = name.split(' (')[0] ?? name
              return (
                <button
                  key={index}
                  type="button"
                  className="preset-pill-btn"
                  onClick={() => loadPreset(preset)}
                  title={lang === 'zh' ? preset.descZh : preset.descEn}
                >
                  {shortName}
                </button>
              )
            })}
          </div>
        </section>

        {/* 国家搜索与选择器 (内嵌平铺式设计，默认显示热门国家且支持即时搜索) */}
        <section className="country-picker-section" aria-label="添加对比国家">
          <div className="section-label">{t[lang].maxLimit}</div>
          <div className="search-box">
            <input
              type="text"
              placeholder={t[lang].searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear"
                onClick={() => setSearchQuery('')}
              >
                ×
              </button>
            )}
          </div>
          
          <div className="country-grid-inline">
            {searchQuery ? (
              <>
                <div className="dropdown-title">{t[lang].searchResults}</div>
                <div className="dropdown-grid">
                  {filteredCountries.slice(0, 15).map((country) => {
                    const isActive = activeCountries.some((item) => item.countryId === country.id)
                    return (
                      <button
                        key={country.id}
                        type="button"
                        className={`country-dropdown-btn ${isActive ? 'active' : ''}`}
                        onClick={() => addCountry(country.id)}
                      >
                        {lang === 'zh' ? country.nameZh : country.sourceName}
                      </button>
                    )
                  })}
                </div>
                {filteredCountries.length === 0 && (
                  <p className="no-results-dropdown">{t[lang].noResults}</p>
                )}
              </>
            ) : (
              <>
                <div className="dropdown-title">{t[lang].continentsRegions}</div>
                <div className="dropdown-grid">
                  {regionsList.map((country) => {
                    const isActive = activeCountries.some((item) => item.countryId === country.id)
                    return (
                      <button
                        key={country.id}
                        type="button"
                        className={`country-dropdown-btn ${isActive ? 'active' : ''}`}
                        onClick={() => addCountry(country.id)}
                      >
                        {lang === 'zh' ? country.nameZh : country.sourceName}
                      </button>
                    )
                  })}
                </div>

                <div className="dropdown-title" style={{ marginTop: '8px' }}>{t[lang].recommendedCountries}</div>
                <div className="dropdown-grid">
                  {recommendedCountriesList.map((country) => {
                    const isActive = activeCountries.some((item) => item.countryId === country.id)
                    return (
                      <button
                        key={country.id}
                        type="button"
                        className={`country-dropdown-btn ${isActive ? 'active' : ''}`}
                        onClick={() => addCountry(country.id)}
                      >
                        {lang === 'zh' ? country.nameZh : country.sourceName}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </section>

        {/* 对比看板 */}
        <section className="compare-board-section" aria-label="对比看板">
          <div className="section-label">{t[lang].compareBoardTitle}</div>
          {activeCountries.length > 0 ? (
            <div className="compare-list">
              {activeCountries.map((item) => {
                return (
                  <div
                    key={item.instanceId}
                    className="compare-item"
                    style={{ borderLeftColor: item.color }}
                  >
                    <div className="compare-item-header">
                      <span className="country-title" style={{ color: item.color }}>
                        <span
                          className="color-dot"
                          style={{ backgroundColor: item.color }}
                        />
                        {lang === 'zh' ? item.nameZh : item.sourceName}
                      </span>
                      <div className="item-actions">
                        <button
                          type="button"
                          className="action-btn"
                          title={t[lang].locate}
                          onClick={() => zoomToCountry(item.instanceId)}
                        >
                          <MapPin size={14} weight="fill" />
                        </button>
                        <button
                          type="button"
                          className="action-btn"
                          title={t[lang].reset}
                          onClick={() => resetCountryCenter(item.instanceId)}
                        >
                          <ArrowsClockwise size={14} weight="bold" />
                        </button>
                        <button
                          type="button"
                          className="action-btn delete-btn"
                          title={t[lang].delete}
                          onClick={() => removeCountry(item.instanceId)}
                        >
                          <Trash size={14} weight="bold" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="empty-state">
              <p>{t[lang].emptyBoard}</p>
            </div>
          )}
        </section>

        {/* 高级显示设置 (折叠手风琴) */}
        <section className="advanced-settings-section" aria-label="显示控制">
          <button
            type="button"
            className="accordion-header"
            onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
            aria-expanded={showAdvancedSettings}
          >
            <span>
              <Info size={16} weight="bold" />
              {t[lang].advancedSettings}
            </span>
            <span className={`chevron ${showAdvancedSettings ? 'open' : ''}`}>▼</span>
          </button>
          
          {showAdvancedSettings && (
            <div className="accordion-content">
              <label className="range-field">
                <span>
                  <Eye size={16} weight="bold" />
                  {t[lang].outlineOpacity}
                </span>
                <output>{Math.round(opacity * 100)}%</output>
                <input
                  type="range"
                  min="15"
                  max="90"
                  value={Math.round(opacity * 100)}
                  onChange={(event) => setOpacity(Number(event.target.value) / 100)}
                />
              </label>

              <div className="toggle-group">
                <button
                  type="button"
                  className="toggle-button"
                  aria-pressed={showOutline}
                  onClick={() => setShowOutline((value) => !value)}
                >
                  {showOutline ? <Eye size={16} weight="bold" /> : <EyeSlash size={16} weight="bold" />}
                  {showOutline ? t[lang].hideOutline : t[lang].showOutline}
                </button>

                <button
                  type="button"
                  className="toggle-button"
                  aria-pressed={showGraticule}
                  onClick={() => setShowGraticule((value) => !value)}
                >
                  {showGraticule ? <Eye size={16} weight="bold" /> : <EyeSlash size={16} weight="bold" />}
                  {showGraticule ? t[lang].hideGrid : t[lang].showGrid}
                </button>

                <button
                  type="button"
                  className="toggle-button reset-all-btn"
                  onClick={resetAllCountryCenters}
                  disabled={activeCountries.length === 0}
                >
                  <ArrowsClockwise size={16} weight="bold" />
                  {t[lang].resetAll}
                </button>
              </div>
            </div>
          )}
        </section>

        <div className="button-grid-global">
          <button
            type="button"
            className="btn-danger"
            onClick={clearAllCountries}
            disabled={activeCountries.length === 0}
          >
            <Trash size={16} weight="bold" />
            {t[lang].clearBoard}
          </button>
        </div>

        <p className="note">
          {t[lang].note}
        </p>
      </aside>

      {/* 地图舞台区域 */}
      <section className="map-stage" aria-label="可拖动地图">
        {/* 浮动面板隐藏时的展开面板按钮 */}
        {isPanelCollapsed && (
          <button
            type="button"
            className="panel-toggle-btn-floating"
            onClick={() => setIsPanelCollapsed(false)}
            title={t[lang].showPanel}
          >
            <CaretLeft size={16} weight="bold" />
            {t[lang].showPanel}
          </button>
        )}

        <div ref={mapNodeRef} className="map-canvas" />
        
        {/* Floating map controls on the map stage itself */}
        <div className="map-controls-floating">
          {/* Map style selector */}
          <div className="floating-card style-selector-floating">
            <div className="style-buttons-mini">
              {(['dark', 'light', 'voyager', 'minimal'] as MapStyle[]).map((style) => (
                <button
                  key={style}
                  type="button"
                  className={`style-btn-mini ${mapStyle === style ? 'active' : ''}`}
                  onClick={() => setMapStyle(style)}
                >
                  {style === 'dark' && t[lang].styleDark}
                  {style === 'light' && t[lang].styleLight}
                  {style === 'voyager' && t[lang].styleColor}
                  {style === 'minimal' && t[lang].styleOffline}
                </button>
              ))}
            </div>
          </div>

          {/* Reset map view */}
          <button
            type="button"
            className="floating-btn reset-view-floating"
            title={lang === 'zh' ? '复位地图视角' : 'Reset Map View'}
            onClick={() => {
              mapRef.current?.flyTo({
                center: INITIAL_CENTER,
                zoom: INITIAL_ZOOM,
                duration: 650,
              })
            }}
          >
            <Crosshair size={14} weight="bold" />
            {lang === 'zh' ? '复位地图' : 'Reset Map'}
          </button>
        </div>

        <svg className="country-overlay" aria-hidden="true">
          {mapRef.current &&
            activeCountries.map((item) => (
              <CountryOverlayPath
                key={item.instanceId}
                map={mapRef.current!}
                country={item}
                opacity={opacity}
                showOutline={showOutline}
                onDragStart={startOverlayDrag}
                mapRenderTick={mapRenderTick}
              />
            ))}
        </svg>
        <div className="map-hint" data-dragging={draggingInstanceId !== null}>
          {draggingInstanceId
            ? (lang === 'zh' ? '正在移动国家轮廓，观察其大小比例形变...' : 'Moving outline. Observe size deformation...')
            : (lang === 'zh' ? '拖动地图上的彩色国家轮廓，平移它们进行纬度形变对比' : 'Drag country outlines to compare latitude projection deformation.')}
        </div>
      </section>
    </main>
  )
}

export default App
