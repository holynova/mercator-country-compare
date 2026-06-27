import {
  geoMercator,
  geoPath,
  type GeoProjection,
  type GeoPermissibleObjects,
} from 'd3-geo'
import {
  ArrowsClockwise,
  Crosshair,
  Eye,
  EyeSlash,
  GlobeHemisphereEast,
  MapPin,
  Ruler,
  SelectionSlash,
  Trash,
  Plus,
  Sparkle,
  Info,
  GithubLogo,
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
  formatArea,
  formatCoordinate,
  mercatorScale,
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
  name: string
  description: string
  countries: Array<{
    countryName: string
    customCenter?: [number, number]
  }>
}

const PRESETS: Preset[] = [
  {
    name: '赤道大缩小 (Equator Shrink)',
    description: '将高纬度大国（格陵兰、俄罗斯、加拿大）拖到赤道，看看它们的真实大小。',
    countries: [
      { countryName: 'Greenland', customCenter: [-40, 0] },
      { countryName: 'Russia', customCenter: [20, 0] },
      { countryName: 'Canada', customCenter: [-100, 0] },
    ],
  },
  {
    name: '中美横向对比 (China vs. USA)',
    description: '将中国和美国平移到高纬度地区（如格陵兰岛旁），对比它们的版图大小。',
    countries: [
      { countryName: 'China', customCenter: [-40, 72] },
      { countryName: 'United States of America', customCenter: [-80, 72] },
    ],
  },
  {
    name: '全球六大领土国 (Six Giants)',
    description: '展示世界领土前六大国家在它们原产地的位置及实际投影比例。',
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

function projectCountryPath(
  map: maplibregl.Map,
  feature: ReturnType<typeof moveCountryFeature>,
) {
  const container = map.getContainer()
  const center = map.getCenter()
  const scale = (512 * 2 ** map.getZoom()) / (2 * Math.PI)
  const projection = geoMercator()
    .scale(scale)
    .translate([container.clientWidth / 2, container.clientHeight / 2])
    .center([center.lng, center.lat])
    .clipAngle(180) as GeoProjection

  return removeLongSvgSegments(
    geoPath(projection)(feature as GeoPermissibleObjects) ?? '',
  )
}

function removeLongSvgSegments(pathData: string) {
  const maxSegmentLength = 180
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

      const distance = Math.hypot(x - previous[0], y - previous[1])
      previous = [x, y]

      return `${distance > maxSegmentLength ? 'M' : 'L'}${x},${y}`
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
          }}
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
  const currentStyleRef = useRef<MapStyle>('dark')

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
  const [mapStyle, setMapStyle] = useState<MapStyle>('dark')
  const [searchQuery, setSearchQuery] = useState('')
  const [opacity, setOpacity] = useState(DEFAULT_OPACITY)
  const [showOutline, setShowOutline] = useState(DEFAULT_SHOW_OUTLINE)
  const [mapRenderTick, setMapRenderTick] = useState(0)

  // Track style in ref to use in events
  useEffect(() => {
    currentStyleRef.current = mapStyle
  }, [mapStyle])

  // Memoize search/filter results
  const filteredCountries = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    if (!query) {
      // Curated list of major countries
      const majorCountries = [
        'China',
        'Russia',
        'United States of America',
        'Canada',
        'Brazil',
        'Australia',
        'India',
        'Greenland',
        'United Kingdom',
        'Japan',
        'France',
        'Germany',
        'South Africa',
        'Egypt',
        'Indonesia',
      ]
      return COUNTRIES.filter((c) => majorCountries.includes(c.sourceName))
    }
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
      'bottom-right',
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
      zoom: Math.max(INITIAL_ZOOM, mapRef.current?.getZoom() ?? INITIAL_ZOOM),
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
      if (preset.name.includes('中美')) {
        map.flyTo({ center: [-60, 62], zoom: 2.1, duration: 800 })
      } else if (preset.name.includes('赤道')) {
        map.flyTo({ center: [-10, 15], zoom: 1.8, duration: 800 })
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
      <aside className="panel" aria-label="地图投影工具控制面板">
        <div className="brand-block">
          <div className="brand-mark">
            <GlobeHemisphereEast size={24} weight="duotone" />
          </div>
          <div>
            <p className="eyebrow">Mercator Projection Lab</p>
            <h1>地图投影形变实验室</h1>
            <a
              href="https://github.com/holynova/mercator-country-compare"
              target="_blank"
              rel="noopener noreferrer"
              className="github-repo-link"
            >
              <GithubLogo size={12} weight="bold" />
              GitHub Repository
            </a>
          </div>
        </div>

        {/* 预设演示区域 */}
        <section className="presets-section" aria-label="经典演示预设">
          <div className="section-label">
            <Sparkle size={16} weight="bold" />
            经典对比场景预设
          </div>
          <div className="presets-list">
            {PRESETS.map((preset, index) => (
              <button
                key={index}
                type="button"
                className="preset-card"
                onClick={() => loadPreset(preset)}
                title={preset.description}
              >
                <strong>{preset.name}</strong>
                <span>{preset.description}</span>
              </button>
            ))}
          </div>
        </section>

        {/* 国家搜索与选择器 */}
        <section className="country-picker-section" aria-label="添加对比国家">
          <div className="section-label">
            <Plus size={16} weight="bold" />
            搜索并添加国家 (最多8个)
          </div>
          <div className="search-box">
            <input
              type="text"
              placeholder="中/英文搜索世界国家..."
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
          <div className="country-grid">
            {filteredCountries.slice(0, 18).map((country) => {
              const isActive = activeCountries.some((item) => item.countryId === country.id)
              return (
                <button
                  key={country.id}
                  type="button"
                  className={`country-button ${isActive ? 'active' : ''}`}
                  onClick={() => addCountry(country.id)}
                >
                  {country.nameZh}
                </button>
              )
            })}
          </div>
          {filteredCountries.length === 0 && (
            <p className="no-results">未找到匹配的国家</p>
          )}
        </section>

        {/* 对比看板 */}
        <section className="compare-board-section" aria-label="对比看板">
          <div className="section-label">
            <Ruler size={16} weight="bold" />
            对比管理看板
          </div>
          {activeCountries.length > 0 ? (
            <div className="compare-list">
              {activeCountries.map((item) => {
                const origScale = mercatorScale(item.originalCenter[1])
                const currScale = mercatorScale(item.currentCenter[1])
                const dimensionRatio = currScale / origScale
                const areaRatio = dimensionRatio ** 2

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
                        {item.nameZh}
                      </span>
                      <div className="item-actions">
                        <button
                          type="button"
                          className="action-btn"
                          title="定位"
                          onClick={() => zoomToCountry(item.instanceId)}
                        >
                          <MapPin size={14} weight="fill" />
                        </button>
                        <button
                          type="button"
                          className="action-btn"
                          title="重置"
                          onClick={() => resetCountryCenter(item.instanceId)}
                        >
                          <ArrowsClockwise size={14} weight="bold" />
                        </button>
                        <button
                          type="button"
                          className="action-btn delete-btn"
                          title="删除"
                          onClick={() => removeCountry(item.instanceId)}
                        >
                          <Trash size={14} weight="bold" />
                        </button>
                      </div>
                    </div>
                    <div className="compare-item-stats">
                      <div>
                        真实面积：<strong>{formatArea(item.areaKm2)}</strong>
                      </div>
                      <div>
                        纬度：从{' '}
                        <strong>{formatCoordinate(item.originalCenter[1], 'lat')}</strong>{' '}
                        移到{' '}
                        <strong>{formatCoordinate(item.currentCenter[1], 'lat')}</strong>
                      </div>
                      <div className="ratio-stat">
                        尺寸放大：<strong>{dimensionRatio.toFixed(2)}x</strong>
                        （面积放大：<strong>{areaRatio.toFixed(2)}x</strong>）
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="empty-state">
              <SelectionSlash size={24} />
              <p>暂无对比国家。请在上方选择或搜索国家添加到地图中。</p>
            </div>
          )}
        </section>

        {/* 控制设置 */}
        <section className="controls" aria-label="显示控制">
          <label className="range-field">
            <span>
              <Eye size={16} weight="bold" />
              轮廓不透明度
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
              {showOutline ? '隐藏描边' : '显示描边'}
            </button>

            <button
              type="button"
              className="toggle-button reset-all-btn"
              onClick={resetAllCountryCenters}
              disabled={activeCountries.length === 0}
            >
              <ArrowsClockwise size={16} weight="bold" />
              全部归位
            </button>
          </div>

          <div className="style-selector">
            <span className="selector-title">
              <Info size={16} weight="bold" />
              选择底图风格
            </span>
            <div className="style-buttons">
              {(['dark', 'light', 'voyager', 'minimal'] as MapStyle[]).map((style) => (
                <button
                  key={style}
                  type="button"
                  className={`style-btn ${mapStyle === style ? 'active' : ''}`}
                  onClick={() => setMapStyle(style)}
                >
                  {style === 'dark' && '暗黑极简'}
                  {style === 'light' && '明亮极简'}
                  {style === 'voyager' && '彩色详细'}
                  {style === 'minimal' && '本地离线'}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="button-grid-global">
          <button
            type="button"
            className="btn-danger"
            onClick={clearAllCountries}
            disabled={activeCountries.length === 0}
          >
            <SelectionSlash size={16} weight="bold" />
            清空对比看板
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              mapRef.current?.flyTo({
                center: INITIAL_CENTER,
                zoom: INITIAL_ZOOM,
                duration: 650,
              })
            }}
          >
            <Crosshair size={16} weight="bold" />
            重置地图视角
          </button>
        </div>

        <p className="note">
          国家真实面积不会改变。视觉形变来自 Web Mercator 投影。高纬度地区拉伸严重（如格陵兰拉伸为实际的14倍以上），拖向赤道会恢复真实面积大小。
        </p>
      </aside>

      <section className="map-stage" aria-label="可拖动地图">
        <div ref={mapNodeRef} className="map-canvas" />
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
            ? '正在移动国家轮廓，观察其大小比例形变...'
            : '拖动地图上的彩色国家轮廓，平移它们进行纬度形变对比'}
        </div>
      </section>
    </main>
  )
}

export default App
