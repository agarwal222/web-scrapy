import {
  Activity,
  ArrowDownToLine,
  ArrowRightToLine,
  Ban,
  Bookmark,
  BoxSelect,
  Check,
  Clock,
  DatabaseBackup,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Filter,
  FlaskConical,
  Ghost,
  Keyboard,
  Layers,
  Link2,
  MousePointer2,
  MousePointerClick,
  Pause,
  Play,
  Plus,
  Save,
  Settings,
  Square,
  TableProperties,
  Target,
  Trash2,
  Upload,
  Wand2,
  Webhook,
  X,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "./components/ui/button"
import { Input } from "./components/ui/input"
import { Label } from "./components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select"

interface ScrapeAction {
  id: string
  type: "click" | "wait" | "type"
  selector?: string
  value?: string
}

interface ScrapedNode {
  id: string
  selector: string
  patternSelector: string
  exactSelector: string
  count: number
  patternCount: number
  exactCount: number
  isExact: boolean

  smartSelector?: string
  targetingStrategy: "pattern" | "strict" | "smart" | "label"
  anchorLabelText?: string

  fallbackColumnId?: string
  hideFromExport?: boolean

  columnName: string
  attribute: string
  availableAttributes: { name: string; preview: string }[]
  regexPreset: "none" | "email" | "phone" | "url" | "linkedin" | "custom"
  customRegexPattern?: string

  actions?: ScrapeAction[]
}

type NavMode = "none" | "next" | "loadMore" | "infinite"

interface Recipe {
  id: string
  domain: string
  name: string
  schema: ScrapedNode[]
  deepSchema: ScrapedNode[]
  container: string | null
  navMode: NavMode
  pagination: string[] | string | null
  deepLinkColumn: string | null
}

const randomSleep = (min: number, max: number) =>
  new Promise((resolve) =>
    setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min),
  )

const navigateAndWait = (tabId: number, url: string, timeoutMs = 15000) => {
  return new Promise<boolean>((resolve) => {
    let resolved = false
    const listener = (
      updatedTabId: number,
      info: chrome.tabs.TabChangeInfo,
    ) => {
      if (updatedTabId === tabId && info.status === "complete") {
        if (!resolved) {
          resolved = true
          chrome.tabs.onUpdated.removeListener(listener)
          setTimeout(() => resolve(true), 2500)
        }
      }
    }
    chrome.tabs.onUpdated.addListener(listener)
    chrome.tabs.update(tabId, { url })
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        chrome.tabs.onUpdated.removeListener(listener)
        resolve(false)
      }
    }, timeoutMs)
  })
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark")
  }, [])

  const [isSelecting, setIsSelecting] = useState(false)
  const [selectionMode, setSelectionMode] = useState<
    "column" | "pagination" | "container" | "clickAction"
  >("column")

  const targetSchemaRef = useRef<"surface" | "deep">("surface")
  const activeActionTargetRef = useRef<{
    colId: string
    actionId: string
  } | null>(null)

  const [isScraping, setIsScraping] = useState(false)
  const [statusText, setStatusText] = useState("")
  const [liveData, setLiveData] = useState<any[]>([])

  const abortController = useRef(false)
  const pauseController = useRef(false)
  const [isPaused, setIsPaused] = useState(false)

  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [previewData, setPreviewData] = useState<any[]>([])
  const [recoveredData, setRecoveredData] = useState<any[] | null>(null)

  const [scrapedNodes, setScrapedNodes] = useState<ScrapedNode[]>([])
  const [containerSelector, setContainerSelector] = useState<string | null>(
    null,
  )
  const [containerCount, setContainerCount] = useState<number>(0)

  const [navMode, setNavMode] = useState<NavMode>("none")
  const [paginationSelectors, setPaginationSelectors] = useState<
    string[] | null
  >(null)

  const [isDeepScrapeEnabled, setIsDeepScrapeEnabled] = useState(false)
  const [deepNodes, setDeepNodes] = useState<ScrapedNode[]>([])
  const [deepLinkColumn, setDeepLinkColumn] = useState<string>("")

  const [pageLimitMode, setPageLimitMode] = useState<"custom" | "all">("custom")
  const [maxPages, setMaxPages] = useState<number>(3)

  const [exportFormat, setExportFormat] = useState<"csv" | "json">("json")
  const [webhookUrl, setWebhookUrl] = useState<string>("")
  const [stealthMode, setStealthMode] = useState<boolean>(false)

  const [activeDomain, setActiveDomain] = useState<string>("")
  const [recipes, setRecipes] = useState<Record<string, Recipe[]>>({})
  const [suggestedRecipe, setSuggestedRecipe] = useState<Recipe | null>(null)

  const [showRecipeManager, setShowRecipeManager] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const init = async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      })
      if (tab?.url) {
        try {
          const domain = new URL(tab.url).hostname.replace("www.", "")
          setActiveDomain(domain)
          chrome.storage.local.get(
            ["scrapy_recipes", "scrapy_settings", "scrapy_recovery_data"],
            (result) => {
              if (result.scrapy_recipes) {
                setRecipes(result.scrapy_recipes)
                if (
                  result.scrapy_recipes[domain] &&
                  result.scrapy_recipes[domain].length > 0
                )
                  setSuggestedRecipe(result.scrapy_recipes[domain][0])
              }
              if (result.scrapy_settings) {
                if (result.scrapy_settings.defaultExportFormat)
                  setExportFormat(result.scrapy_settings.defaultExportFormat)
                if (result.scrapy_settings.webhookUrl)
                  setWebhookUrl(result.scrapy_settings.webhookUrl)
                if (result.scrapy_settings.stealthMode !== undefined)
                  setStealthMode(result.scrapy_settings.stealthMode)
              }
              if (
                result.scrapy_recovery_data &&
                result.scrapy_recovery_data.length > 0
              ) {
                setRecoveredData(result.scrapy_recovery_data)
              }
            },
          )
        } catch (e) {}
      }
    }
    init()

    const handleMessage = (message: any) => {
      if (message.action === "ELEMENTS_SELECTED") {
        setIsSelecting(false)
        const hasSmartSelector = !!message.payload.smartSelector
        const newNode: ScrapedNode = {
          id: crypto.randomUUID(),
          selector: message.payload.patternSelector,
          patternSelector: message.payload.patternSelector,
          exactSelector: message.payload.exactSelector,
          count: message.payload.patternCount,
          patternCount: message.payload.patternCount,
          exactCount: message.payload.exactCount,
          isExact: false,
          smartSelector: message.payload.smartSelector,
          targetingStrategy: hasSmartSelector ? "smart" : "pattern",
          regexPreset: "none",
          fallbackColumnId: undefined,
          hideFromExport: false,
          columnName: `Column ${Date.now().toString().slice(-4)}`,
          attribute: "text",
          availableAttributes: message.payload.attributes,
          actions: [],
        }
        if (targetSchemaRef.current === "surface")
          setScrapedNodes((prev) => [...prev, newNode])
        else setDeepNodes((prev) => [...prev, newNode])
      }

      if (
        message.action === "ACTION_SELECTED" &&
        activeActionTargetRef.current
      ) {
        setIsSelecting(false)
        const { colId, actionId } = activeActionTargetRef.current
        const setNodes =
          targetSchemaRef.current === "surface" ? setScrapedNodes : setDeepNodes
        setNodes((prev) =>
          prev.map((n) =>
            n.id === colId
              ? {
                  ...n,
                  actions: n.actions?.map((a) =>
                    a.id === actionId
                      ? { ...a, selector: message.payload.selector }
                      : a,
                  ),
                }
              : n,
          ),
        )
        activeActionTargetRef.current = null
        setSelectionMode("column")
      }

      if (message.action === "PAGINATION_SELECTED") {
        setIsSelecting(false)
        setPaginationSelectors(message.payload.selectors)
      }
      if (message.action === "CONTAINER_SELECTED") {
        setIsSelecting(false)
        setContainerSelector(message.payload.selector)
        setContainerCount(message.payload.count)
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)
    return () => chrome.runtime.onMessage.removeListener(handleMessage)
  }, [])

  useEffect(() => {
    const syncHighlights = async () => {
      if (isScraping) return
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          lastFocusedWindow: true,
        })
        if (!tab?.id) return
        chrome.tabs.sendMessage(tab.id, {
          action: "SYNC_HIGHLIGHTS",
          payload: {
            schema: [...scrapedNodes, ...deepNodes],
            containerSelector,
            paginationSelectors,
          },
        })
      } catch (error) {}
    }
    syncHighlights()
  }, [
    scrapedNodes,
    deepNodes,
    containerSelector,
    paginationSelectors,
    isScraping,
  ])

  const saveSettings = (key: string, value: any) => {
    chrome.storage.local.get(["scrapy_settings"], (res) => {
      const currentSettings = res.scrapy_settings || {}
      const newSettings = { ...currentSettings, [key]: value }
      chrome.storage.local.set({ scrapy_settings: newSettings })
    })
  }

  const handleSaveRecipe = () => {
    const recipeName = prompt(
      "Enter a name for this template:",
      `${activeDomain} template`,
    )
    if (!recipeName) return
    const newRecipe: Recipe = {
      id: crypto.randomUUID(),
      domain: activeDomain,
      name: recipeName,
      schema: scrapedNodes,
      deepSchema: deepNodes,
      container: containerSelector,
      navMode: navMode,
      pagination: paginationSelectors,
      deepLinkColumn: deepLinkColumn,
    }
    const updatedRecipes = { ...recipes }
    if (!updatedRecipes[activeDomain]) updatedRecipes[activeDomain] = []
    updatedRecipes[activeDomain].push(newRecipe)
    chrome.storage.local.set({ scrapy_recipes: updatedRecipes }, () => {
      setRecipes(updatedRecipes)
      alert("Recipe Saved!")
    })
  }

  const loadRecipe = (recipe: Recipe) => {
    setScrapedNodes(recipe.schema)
    setContainerSelector(recipe.container)
    setNavMode(recipe.navMode || "none")
    if (recipe.pagination)
      setPaginationSelectors(
        Array.isArray(recipe.pagination)
          ? recipe.pagination
          : [recipe.pagination],
      )
    else setPaginationSelectors(null)

    if (recipe.deepSchema && recipe.deepSchema.length > 0) {
      setIsDeepScrapeEnabled(true)
      setDeepNodes(recipe.deepSchema)
      setDeepLinkColumn(recipe.deepLinkColumn || "")
    } else {
      setIsDeepScrapeEnabled(false)
      setDeepNodes([])
      setDeepLinkColumn("")
    }
    setSuggestedRecipe(null)
    setShowRecipeManager(false)
  }

  const deleteRecipe = (domain: string, id: string) => {
    const updatedRecipes = { ...recipes }
    updatedRecipes[domain] = updatedRecipes[domain].filter((r) => r.id !== id)
    if (updatedRecipes[domain].length === 0) delete updatedRecipes[domain]
    chrome.storage.local.set({ scrapy_recipes: updatedRecipes }, () =>
      setRecipes(updatedRecipes),
    )
  }

  const exportAllRecipes = () => {
    const blob = new Blob([JSON.stringify(recipes, null, 2)], {
      type: "application/json;charset=utf-8;",
    })
    chrome.downloads.download({
      url: URL.createObjectURL(blob),
      filename: `scrapy_recipes_backup_${Date.now()}.json`,
      saveAs: false,
    })
  }

  const importRecipes = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const importedData = JSON.parse(e.target?.result as string)
        const mergedRecipes = { ...recipes }
        for (const domain in importedData) {
          if (!mergedRecipes[domain]) mergedRecipes[domain] = []
          importedData[domain].forEach((importedRecipe: Recipe) => {
            if (!mergedRecipes[domain].some((r) => r.id === importedRecipe.id))
              mergedRecipes[domain].push(importedRecipe)
          })
        }
        chrome.storage.local.set({ scrapy_recipes: mergedRecipes }, () => {
          setRecipes(mergedRecipes)
          alert("Recipes imported!")
        })
      } catch (err) {
        alert("Failed to parse JSON file.")
      }
    }
    reader.readAsText(file)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const toggleScraper = async (
    mode: "column" | "pagination" | "container" | "clickAction",
    target: "surface" | "deep" = "surface",
    targetData?: { colId: string; actionId: string },
  ) => {
    targetSchemaRef.current = target
    activeActionTargetRef.current = targetData || null
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      })
      if (!tab?.id) return
      chrome.tabs.sendMessage(
        tab.id,
        { action: "TOGGLE_SELECTION", mode },
        (response) => {
          if (chrome.runtime.lastError)
            alert("Please refresh the webpage to inject the scraper script.")
          if (response?.status === "success") {
            setIsSelecting(response.isSelecting)
            setSelectionMode(response.mode)
          }
        },
      )
    } catch (error) {
      console.error(error)
    }
  }

  const clearSelection = () => {
    setScrapedNodes([])
    setDeepNodes([])
    setPaginationSelectors(null)
    setContainerSelector(null)
    setIsDeepScrapeEnabled(false)
    setNavMode("none")
    setLiveData([])
  }

  const convertToCSV = (objArray: any[]) => {
    if (objArray.length === 0) return ""
    const headers = Object.keys(Object.assign({}, ...objArray))
    const rows = [headers.join(",")]
    for (const row of objArray) {
      const values = headers.map(
        (header) =>
          `"${(row[header] ? String(row[header]) : "").replace(/"/g, '""')}"`,
      )
      rows.push(values.join(","))
    }
    return rows.join("\n")
  }

  const exportDataBlob = (data: any[], format: "csv" | "json") => {
    let blob: Blob
    let filename: string
    if (format === "csv") {
      blob = new Blob([convertToCSV(data)], { type: "text/csv;charset=utf-8;" })
      filename = `scrapy_export_${Date.now()}.csv`
    } else {
      blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json;charset=utf-8;",
      })
      filename = `scrapy_export_${Date.now()}.json`
    }
    chrome.downloads.download({
      url: URL.createObjectURL(blob),
      filename,
      saveAs: false,
    })
  }

  const handleScrapeAndDownload = async (runMode: "test" | "full" = "full") => {
    abortController.current = false
    pauseController.current = false
    setIsPaused(false)
    setIsScraping(true)
    setSuggestedRecipe(null)
    setLiveData([])

    let currentDataState: any[] = []
    let currentPage = 1
    const keepScraping = true
    let workerWindowId: number | null = null

    try {
      const [initTab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      })
      const startUrl = initTab?.url
      if (!startUrl) throw new Error("No active URL found to start scraping.")

      setStatusText("Spawning isolated worker...")
      const workerWindow = await chrome.windows.create({
        url: startUrl,
        type: "popup",
        width: 1000,
        height: 800,
        focused: true,
      })
      workerWindowId = workerWindow.id || null
      const workerTabId = workerWindow.tabs?.[0]?.id
      if (!workerTabId) throw new Error("Failed to attach to worker tab.")

      await navigateAndWait(workerTabId, startUrl)
      chrome.tabs.sendMessage(workerTabId, { action: "BLOCK_UI" })

      while (keepScraping) {
        if (abortController.current) {
          setStatusText("Job Stopped Early.")
          break
        }

        while (pauseController.current) {
          setStatusText("Paused... Click Resume to continue.")
          await randomSleep(1000, 1000)
          if (abortController.current) break
        }
        if (abortController.current) break

        setStatusText(`Extracting Surface Data (Page ${currentPage})...`)
        await new Promise((resolve) =>
          chrome.tabs.sendMessage(
            workerTabId,
            { action: "SCROLL_PAGE", payload: { isStealth: stealthMode } },
            resolve,
          ),
        )
        await randomSleep(stealthMode ? 1200 : 800, stealthMode ? 2500 : 1500)

        const scrapeRes: any = await new Promise((resolve) =>
          chrome.tabs.sendMessage(
            workerTabId,
            {
              action: "EXECUTE_SCRAPE",
              payload: {
                schema: scrapedNodes,
                containerSelector,
                isStealth: stealthMode,
              },
            },
            resolve,
          ),
        )
        if (scrapeRes?.status === "success" && scrapeRes.data) {
          currentDataState = [...currentDataState, ...scrapeRes.data]
          setLiveData([...currentDataState])
        } else {
          break
        }

        if (runMode === "test") {
          if (currentDataState.length > 5)
            currentDataState = currentDataState.slice(0, 5)
          break
        }

        if (runMode === "full") {
          chrome.storage.local.set({ scrapy_recovery_data: currentDataState })
        }

        if (
          abortController.current ||
          navMode === "none" ||
          (pageLimitMode === "custom" && currentPage >= maxPages)
        )
          break

        if (navMode === "infinite") {
          setStatusText(`Scrolling down...`)
          await randomSleep(
            stealthMode ? 4000 : 3000,
            stealthMode ? 7000 : 5000,
          )
          currentPage++
        } else if (navMode === "loadMore" || navMode === "next") {
          if (!paginationSelectors || paginationSelectors.length === 0) break
          setStatusText(
            navMode === "loadMore"
              ? `Clicking Load More...`
              : `Navigating to page ${currentPage + 1}...`,
          )

          const clickRes: any = await new Promise((resolve) =>
            chrome.tabs.sendMessage(
              workerTabId,
              {
                action: "CLICK_NEXT",
                payload: {
                  selectors: paginationSelectors,
                  isStealth: stealthMode,
                },
              },
              resolve,
            ),
          )

          if (clickRes?.status !== "success") {
            break
          }
          await randomSleep(
            navMode === "loadMore" ? 3000 : 4000,
            navMode === "loadMore" ? 5000 : 6000,
          )
          currentPage++
          if (navMode === "next")
            chrome.tabs.sendMessage(workerTabId, { action: "BLOCK_UI" })
        }
      }

      setStatusText(`Deduplicating rows...`)
      currentDataState = Array.from(
        new Set(currentDataState.map((a) => JSON.stringify(a))),
      ).map((a) => JSON.parse(a))
      setLiveData([...currentDataState])

      if (
        !abortController.current &&
        isDeepScrapeEnabled &&
        deepLinkColumn &&
        deepNodes.length > 0
      ) {
        for (let i = 0; i < currentDataState.length; i++) {
          if (abortController.current) {
            setStatusText("Deep Scrape Stopped.")
            break
          }
          while (pauseController.current) {
            setStatusText("Paused... Click Resume to continue.")
            await randomSleep(1000, 1000)
            if (abortController.current) break
          }
          if (abortController.current) break

          const targetUrl = currentDataState[i][deepLinkColumn]
          if (
            !targetUrl ||
            typeof targetUrl !== "string" ||
            !targetUrl.startsWith("http")
          ) {
            currentDataState[i]["_deep_scrape_status"] = "Invalid URL"
            continue
          }
          setStatusText(
            `Deep Scraping Profile ${i + 1} of ${currentDataState.length}...`,
          )
          const loadSuccess = await navigateAndWait(workerTabId, targetUrl)
          if (!loadSuccess) {
            currentDataState[i]["_deep_scrape_status"] = "Timeout"
            continue
          }
          const deepRes: any = await new Promise((resolve) =>
            chrome.tabs.sendMessage(
              workerTabId,
              {
                action: "EXECUTE_SCRAPE",
                payload: { schema: deepNodes, isStealth: stealthMode },
              },
              resolve,
            ),
          )
          if (
            deepRes?.status === "success" &&
            deepRes.data &&
            deepRes.data.length > 0
          ) {
            currentDataState[i] = { ...currentDataState[i], ...deepRes.data[0] }
            setLiveData([...currentDataState])
          } else {
            currentDataState[i]["_deep_scrape_status"] = "Failed Extraction"
          }

          if (runMode === "full") {
            chrome.storage.local.set({ scrapy_recovery_data: currentDataState })
          }

          await randomSleep(
            stealthMode ? 3000 : 2000,
            stealthMode ? 6000 : 4000,
          )
        }
      }

      const cleanedData = currentDataState.map((row) => {
        const newRow = { ...row }
        const allNodes = [
          ...scrapedNodes,
          ...(isDeepScrapeEnabled ? deepNodes : []),
        ]
        allNodes.forEach((n) => {
          if (n.hideFromExport) delete newRow[n.columnName]
        })
        return newRow
      })

      if (runMode === "test") {
        setPreviewData(cleanedData)
        setShowPreviewModal(true)
      } else {
        if (webhookUrl && cleanedData.length > 0) {
          setStatusText(`Delivering data to Webhook...`)
          try {
            const res = await fetch(webhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(cleanedData),
            })
            if (res.ok) setStatusText("Webhook delivered successfully!")
            else setStatusText("Webhook delivery failed.")
            await randomSleep(1500, 2000)
          } catch (e) {
            setStatusText("Webhook delivery error.")
            await randomSleep(1500, 2000)
          }
        }

        setStatusText(`Generating ${exportFormat.toUpperCase()}...`)
        if (cleanedData.length > 0) {
          exportDataBlob(cleanedData, exportFormat)
          chrome.storage.local.remove("scrapy_recovery_data")
        }
      }
    } catch (error) {
      console.error("Scraping loop failed", error)
    } finally {
      if (workerWindowId)
        chrome.windows
          .remove(workerWindowId)
          .catch((err) => console.error("Failed to close worker", err))
      setIsScraping(false)
      setStatusText("")
      abortController.current = false
      pauseController.current = false
      setIsPaused(false)
    }
  }

  const addAction = (
    nodeId: string,
    type: "click" | "wait" | "type",
    target: "surface" | "deep",
  ) => {
    const newAction: ScrapeAction = {
      id: crypto.randomUUID(),
      type,
      value: type === "wait" ? "500" : "",
    }
    const setNodes = target === "surface" ? setScrapedNodes : setDeepNodes
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId
          ? { ...n, actions: [...(n.actions || []), newAction] }
          : n,
      ),
    )
  }

  const updateAction = (
    nodeId: string,
    actionId: string,
    key: keyof ScrapeAction,
    value: string,
    target: "surface" | "deep",
  ) => {
    const setNodes = target === "surface" ? setScrapedNodes : setDeepNodes
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              actions: n.actions?.map((a) =>
                a.id === actionId ? { ...a, [key]: value } : a,
              ),
            }
          : n,
      ),
    )
  }

  const removeAction = (
    nodeId: string,
    actionId: string,
    target: "surface" | "deep",
  ) => {
    const setNodes = target === "surface" ? setScrapedNodes : setDeepNodes
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId
          ? { ...n, actions: n.actions?.filter((a) => a.id !== actionId) }
          : n,
      ),
    )
  }

  const renderNodeControls = (
    node: ScrapedNode,
    target: "surface" | "deep",
    allNodes: ScrapedNode[],
  ) => {
    const activePreview =
      node.availableAttributes.find((a) => a.name === node.attribute)
        ?.preview || "No data."
    const setNodes = target === "surface" ? setScrapedNodes : setDeepNodes
    const isNodeActionSelecting =
      isSelecting && activeActionTargetRef.current?.colId === node.id
    const isRegexCustom = node.regexPreset === "custom"

    return (
      <div
        key={node.id}
        className={`p-4 bg-card rounded-lg border shadow-sm group transition-all ${node.hideFromExport ? "border-border/30 opacity-60" : "border-border"}`}
      >
        {/* Header Row */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 space-y-1">
            <Input
              disabled={isScraping}
              value={node.columnName}
              onChange={(e) =>
                setNodes((prev) =>
                  prev.map((n) =>
                    n.id === node.id ? { ...n, columnName: e.target.value } : n,
                  ),
                )
              }
              className={`bg-transparent border-transparent hover:bg-muted focus:bg-background focus:ring-1 focus:ring-ring h-8 text-sm font-semibold px-2 -ml-2 rounded shadow-none transition-colors ${node.hideFromExport ? "text-muted-foreground" : "text-foreground"}`}
            />
            <div className="flex items-center gap-2 px-1">
              <p className="text-[10px] text-muted-foreground font-mono">
                {node.count} matches
              </p>
              {node.smartSelector && (
                <span className="flex items-center gap-1 text-[9px] text-foreground bg-muted border border-border px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold">
                  <Wand2 className="w-2.5 h-2.5" /> Smart Link
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              disabled={isScraping}
              onClick={() =>
                setNodes((prev) =>
                  prev.map((n) =>
                    n.id === node.id
                      ? { ...n, hideFromExport: !n.hideFromExport }
                      : n,
                  ),
                )
              }
              variant="ghost"
              size="icon"
              title={
                node.hideFromExport ? "Hidden from export" : "Visible in export"
              }
              className={`w-7 h-7 transition-opacity ${node.hideFromExport ? "text-muted-foreground opacity-100" : "text-foreground opacity-0 group-hover:opacity-100"}`}
            >
              {node.hideFromExport ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </Button>
            <Button
              disabled={isScraping}
              onClick={() =>
                setNodes((prev) => prev.filter((n) => n.id !== node.id))
              }
              variant="ghost"
              size="icon"
              className="w-7 h-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Primary Settings Grid */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Extract
            </Label>
            <Select
              disabled={isScraping}
              value={node.attribute}
              onValueChange={(val) =>
                setNodes((prev) =>
                  prev.map((n) =>
                    n.id === node.id ? { ...n, attribute: val } : n,
                  ),
                )
              }
            >
              <SelectTrigger className="h-8 text-xs bg-background border-border shadow-sm rounded-md capitalize">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[9999] border-border">
                {node.availableAttributes.map((attr) => (
                  <SelectItem
                    key={attr.name}
                    value={attr.name}
                    className="capitalize text-xs"
                  >
                    {attr.name === "text" ? "Inner Text" : attr.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
              <Filter className="w-3 h-3" /> Format
            </Label>
            <Select
              disabled={isScraping}
              value={node.regexPreset || "none"}
              onValueChange={(val: any) =>
                setNodes((prev) =>
                  prev.map((n) =>
                    n.id === node.id ? { ...n, regexPreset: val } : n,
                  ),
                )
              }
            >
              <SelectTrigger className="h-8 text-xs bg-background border-border shadow-sm rounded-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[9999] border-border">
                <SelectItem value="none">Raw Output</SelectItem>
                <SelectItem value="email">Email Address</SelectItem>
                <SelectItem value="phone">Phone Number</SelectItem>
                <SelectItem value="url">Web URL</SelectItem>
                <SelectItem value="linkedin">LinkedIn URL</SelectItem>
                <SelectItem value="custom">Custom Regex</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isRegexCustom && (
          <div className="mb-4 animate-in fade-in slide-in-from-top-1">
            <Input
              disabled={isScraping}
              placeholder="e.g., [A-Z0-9._%+-]+@[A-Z0-9.-]+"
              value={node.customRegexPattern || ""}
              onChange={(e) =>
                setNodes((prev) =>
                  prev.map((n) =>
                    n.id === node.id
                      ? { ...n, customRegexPattern: e.target.value }
                      : n,
                  ),
                )
              }
              className="h-8 text-xs font-mono bg-background border-border shadow-sm"
            />
          </div>
        )}

        <div className="bg-muted rounded-md p-2 border border-border mb-4">
          <p
            className="text-[10px] text-muted-foreground font-mono truncate"
            title={activePreview}
          >
            {activePreview}
          </p>
        </div>

        {/* Advanced Strategy Grid */}
        <div className="pt-4 border-t border-border space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
                <Target className="w-3 h-3" /> Strategy
              </Label>
              <Select
                disabled={isScraping}
                value={node.targetingStrategy || "pattern"}
                onValueChange={(val: any) =>
                  setNodes((prev) =>
                    prev.map((n) =>
                      n.id === node.id
                        ? {
                            ...n,
                            targetingStrategy: val,
                            selector:
                              val === "strict"
                                ? n.exactSelector
                                : n.patternSelector,
                          }
                        : n,
                    ),
                  )
                }
              >
                <SelectTrigger className="h-8 text-xs bg-background border-border shadow-sm rounded-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[9999] border-border">
                  <SelectItem value="pattern">Pattern Match</SelectItem>
                  <SelectItem value="strict">Strict DOM Path</SelectItem>
                  <SelectItem value="smart" disabled={!node.smartSelector}>
                    Smart Attribute
                  </SelectItem>
                  <SelectItem value="label">Anchor to Label</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
                Fallback To
              </Label>
              <Select
                disabled={isScraping}
                value={node.fallbackColumnId || "none"}
                onValueChange={(val: string) =>
                  setNodes((prev) =>
                    prev.map((n) =>
                      n.id === node.id
                        ? {
                            ...n,
                            fallbackColumnId: val === "none" ? undefined : val,
                          }
                        : n,
                    ),
                  )
                }
              >
                <SelectTrigger className="h-8 text-xs bg-background border-border shadow-sm rounded-md">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent className="z-[9999] border-border">
                  <SelectItem value="none">None</SelectItem>
                  {allNodes
                    .filter((n) => n.id !== node.id)
                    .map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.columnName}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {node.targetingStrategy === "label" && (
            <div className="pt-1 animate-in fade-in slide-in-from-top-1">
              <Input
                disabled={isScraping}
                placeholder="Enter exact label text (e.g., 'Email:')"
                value={node.anchorLabelText || ""}
                onChange={(e) =>
                  setNodes((prev) =>
                    prev.map((n) =>
                      n.id === node.id
                        ? { ...n, anchorLabelText: e.target.value }
                        : n,
                    ),
                  )
                }
                className="h-8 text-xs bg-background border-border shadow-sm"
              />
            </div>
          )}
        </div>

        {/* Actions Section */}
        <div className="pt-4 mt-4 border-t border-border space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Pre-Scrape Actions
            </Label>
            <Select
              onValueChange={(val: any) => addAction(node.id, val, target)}
              value=""
            >
              <SelectTrigger className="h-7 w-24 text-[10px] bg-muted border-border hover:bg-muted/80 shadow-none">
                <span className="flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Action
                </span>
              </SelectTrigger>
              <SelectContent className="z-[9999] border-border">
                <SelectItem value="click" className="text-xs">
                  <span className="flex items-center gap-2">
                    <MousePointerClick className="w-3 h-3 text-foreground" />{" "}
                    Click
                  </span>
                </SelectItem>
                <SelectItem value="type" className="text-xs">
                  <span className="flex items-center gap-2">
                    <Keyboard className="w-3 h-3 text-foreground" /> Type Text
                  </span>
                </SelectItem>
                <SelectItem value="wait" className="text-xs">
                  <span className="flex items-center gap-2">
                    <Clock className="w-3 h-3 text-foreground" /> Wait
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            {(node.actions || []).map((action) => {
              const isThisActionSelecting =
                isNodeActionSelecting &&
                activeActionTargetRef.current?.actionId === action.id
              return (
                <div
                  key={action.id}
                  className="flex flex-col gap-2 bg-muted/50 p-2.5 rounded-md border border-border relative group/action"
                >
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute top-1 right-1 w-5 h-5 text-muted-foreground hover:text-destructive opacity-0 group-hover/action:opacity-100 transition-opacity"
                    onClick={() => removeAction(node.id, action.id, target)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                  <div className="flex items-center gap-1.5">
                    {action.type === "click" && (
                      <MousePointerClick className="w-3 h-3 text-muted-foreground" />
                    )}
                    {action.type === "wait" && (
                      <Clock className="w-3 h-3 text-muted-foreground" />
                    )}
                    {action.type === "type" && (
                      <Keyboard className="w-3 h-3 text-muted-foreground" />
                    )}
                    <span className="text-[10px] uppercase font-semibold text-foreground">
                      {action.type}
                    </span>
                  </div>
                  {action.type === "wait" ? (
                    <div className="flex items-center gap-2 mt-0.5">
                      <Input
                        type="number"
                        value={action.value}
                        onChange={(e) =>
                          updateAction(
                            node.id,
                            action.id,
                            "value",
                            e.target.value,
                            target,
                          )
                        }
                        className="h-7 text-xs w-24 bg-background border-border"
                      />{" "}
                      <span className="text-xs text-muted-foreground">ms</span>
                    </div>
                  ) : (
                    <div className="space-y-2 mt-0.5 pr-5">
                      {action.selector ? (
                        <div className="flex items-center gap-2">
                          <span
                            className="text-xs font-mono text-muted-foreground bg-background border border-border rounded px-2 py-1 truncate flex-1 block"
                            title={action.selector}
                          >
                            {action.selector}
                          </span>
                          <Button
                            size="icon"
                            variant="outline"
                            className="w-7 h-7 shrink-0"
                            onClick={() =>
                              toggleScraper("clickAction", target, {
                                colId: node.id,
                                actionId: action.id,
                              })
                            }
                          >
                            <MousePointer2 className="w-3 h-3 text-foreground" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className={`h-7 text-xs w-full border-dashed ${isThisActionSelecting ? "border-foreground text-foreground bg-muted" : "text-muted-foreground"}`}
                          onClick={() =>
                            toggleScraper("clickAction", target, {
                              colId: node.id,
                              actionId: action.id,
                            })
                          }
                        >
                          {isThisActionSelecting
                            ? "Select target on page..."
                            : "Select DOM Element"}
                        </Button>
                      )}
                      {action.type === "type" && (
                        <Input
                          placeholder="Enter text to type..."
                          value={action.value}
                          onChange={(e) =>
                            updateAction(
                              node.id,
                              action.id,
                              "value",
                              e.target.value,
                              target,
                            )
                          }
                          className="h-7 text-xs bg-background border-border"
                        />
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  const getTableHeaders = () => {
    const surfaceHeaders = scrapedNodes
      .filter((n) => !n.hideFromExport)
      .map((n) => n.columnName)
    const deepHeaders = isDeepScrapeEnabled
      ? deepNodes.filter((n) => !n.hideFromExport).map((n) => n.columnName)
      : []
    return [...surfaceHeaders, ...deepHeaders]
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-sans antialiased selection:bg-muted">
      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm animate-in fade-in duration-200">
          <header className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <Settings className="w-4 h-4" /> Global Settings
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 hover:bg-muted"
              onClick={() => setShowSettings(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </header>
          <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5 font-semibold uppercase tracking-wider">
                <Download className="w-3.5 h-3.5" /> Default Export Format
              </Label>
              <Select
                value={exportFormat}
                onValueChange={(val: "csv" | "json") => {
                  setExportFormat(val)
                  saveSettings("defaultExportFormat", val)
                }}
              >
                <SelectTrigger className="w-full h-9 bg-background border-border shadow-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[9999] border-border">
                  <SelectItem value="json">.JSON (APIs/n8n)</SelectItem>
                  <SelectItem value="csv">.CSV (Spreadsheets)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 pt-6 border-t border-border">
              <div className="space-y-1.5">
                <Label className="text-xs text-foreground flex items-center gap-1.5 font-semibold">
                  <Webhook className="w-4 h-4" /> Webhook Integration
                </Label>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Automatically POST JSON data to this URL when a scrape
                  finishes.
                </p>
              </div>
              <Input
                placeholder="https://your-n8n-or-crm-webhook-url.com"
                value={webhookUrl}
                onChange={(e) => {
                  setWebhookUrl(e.target.value)
                  saveSettings("webhookUrl", e.target.value)
                }}
                className="bg-background border-border shadow-sm text-xs font-mono h-9"
              />
            </div>

            <div className="space-y-3 pt-6 border-t border-border">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-foreground flex items-center gap-1.5 font-semibold">
                    <Ghost className="w-4 h-4" /> Stealth Mode
                  </Label>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Simulates human-like scrolling and adds randomized
                    micro-delays to actions to bypass basic bot protection.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={stealthMode}
                  onChange={(e) => {
                    setStealthMode(e.target.checked)
                    saveSettings("stealthMode", e.target.checked)
                  }}
                  className="accent-foreground w-5 h-5 shrink-0 mt-1 cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recipe Modal */}
      {showRecipeManager && (
        <div className="absolute inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm animate-in fade-in duration-200">
          <header className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <Bookmark className="w-4 h-4" /> Saved Recipes
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 hover:bg-muted"
              onClick={() => setShowRecipeManager(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </header>
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex gap-2">
            <Button
              onClick={exportAllRecipes}
              variant="outline"
              size="sm"
              className="flex-1 text-xs h-8 bg-background shadow-sm border-border"
            >
              <Download className="w-3.5 h-3.5 mr-2" /> Export Backup
            </Button>
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              size="sm"
              className="flex-1 text-xs h-8 bg-background shadow-sm border-border"
            >
              <Upload className="w-3.5 h-3.5 mr-2" /> Import JSON
            </Button>
            <input
              type="file"
              accept=".json"
              hidden
              ref={fileInputRef}
              onChange={importRecipes}
            />
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
            {Object.keys(recipes).length === 0 && (
              <div className="text-center mt-12 text-muted-foreground">
                <Bookmark className="w-8 h-8 mx-auto mb-3 opacity-20" />
                <p className="text-xs font-medium">No saved recipes yet.</p>
              </div>
            )}
            {Object.entries(recipes).map(([domain, domainRecipes]) => (
              <div key={domain} className="space-y-3">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold px-1">
                  {domain}
                </p>
                <div className="space-y-2">
                  {domainRecipes.map((recipe) => (
                    <div
                      key={recipe.id}
                      className="flex items-center justify-between p-3.5 bg-card border border-border shadow-sm rounded-lg group hover:border-foreground/30 transition-colors"
                    >
                      <div>
                        <p className="text-xs font-semibold text-foreground mb-1">
                          {recipe.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          {recipe.schema.length} cols • {recipe.navMode}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteRecipe(domain, recipe.id)}
                          className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Delete
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => loadRecipe(recipe)}
                          className="h-8 px-3 text-xs font-medium shadow-sm"
                        >
                          Load
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live Preview Modal */}
      {showPreviewModal && (
        <div className="absolute inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm animate-in fade-in duration-200">
          <header className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <FlaskConical className="w-4 h-4" /> Live Preview
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 hover:bg-muted"
              onClick={() => setShowPreviewModal(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </header>
          <div className="flex-1 overflow-auto p-4 custom-scrollbar bg-muted/10">
            <div className="border border-border rounded-lg overflow-hidden bg-card shadow-sm">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-muted-foreground w-12 border-r border-border">
                        #
                      </th>
                      {getTableHeaders().map((h, i) => (
                        <th
                          key={i}
                          className="px-4 py-3 font-semibold text-foreground border-r border-border"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {previewData.map((row, idx) => (
                      <tr
                        key={idx}
                        className="hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-4 py-3 text-muted-foreground font-mono border-r border-border">
                          {idx + 1}
                        </td>
                        {getTableHeaders().map((h, i) => (
                          <td
                            key={i}
                            className="px-4 py-3 max-w-[250px] truncate border-r border-border text-foreground/80"
                            title={row[h]}
                          >
                            {row[h] || "-"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="p-4 border-t border-border flex justify-end gap-3 bg-background">
            <Button
              variant="outline"
              size="sm"
              className="h-9 shadow-sm"
              onClick={() => setShowPreviewModal(false)}
            >
              Adjust Configuration
            </Button>
            <Button
              size="sm"
              className="h-9 font-semibold shadow-sm"
              onClick={() => {
                setShowPreviewModal(false)
                handleScrapeAndDownload("full")
              }}
            >
              <Play className="w-4 h-4 mr-1.5" /> Start Full Scrape
            </Button>
          </div>
        </div>
      )}

      {/* Main App Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/90 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-2.5 text-foreground">
          <BoxSelect className="w-4 h-4" />{" "}
          <span className="text-sm font-semibold tracking-tight">
            Web Scrapy
          </span>
        </div>
        {!isScraping && (
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSettings(true)}
              className="w-8 h-8 text-muted-foreground hover:text-foreground relative"
            >
              <Settings className="w-4 h-4" />
              {(webhookUrl || stealthMode) && (
                <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-foreground rounded-full border border-background"></span>
              )}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowRecipeManager(true)}
              className="h-8 text-xs font-medium flex gap-2 px-3 shadow-sm"
            >
              Recipes
              <span className="bg-background text-foreground px-1.5 py-0.5 rounded text-[10px] shadow-sm border border-border">
                {Object.values(recipes).flat().length}
              </span>
            </Button>
            {(scrapedNodes.length > 0 ||
              deepNodes.length > 0 ||
              containerSelector ||
              paginationSelectors) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive ml-1"
              >
                Clear
              </Button>
            )}
          </div>
        )}
      </header>

      {/* Recovery Banner */}
      {!isScraping && recoveredData && (
        <div className="mx-4 mt-4 p-3.5 bg-card border border-border shadow-sm rounded-lg flex items-center justify-between animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2.5 text-foreground text-xs font-medium">
            <DatabaseBackup className="w-4 h-4 text-muted-foreground" />
            <span>Recovered {recoveredData.length} rows.</span>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                setRecoveredData(null)
                chrome.storage.local.remove("scrapy_recovery_data")
              }}
            >
              Dismiss
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-xs shadow-sm font-medium"
              onClick={() => exportDataBlob(recoveredData, exportFormat)}
            >
              Export Data
            </Button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {isScraping ? (
        <main className="flex-1 flex flex-col overflow-hidden bg-background">
          <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
            <div className="flex items-center gap-3">
              <Activity className="w-4 h-4 text-foreground animate-pulse" />
              <span className="text-xs font-semibold text-foreground tracking-wide">
                {statusText}
              </span>
            </div>
            <div className="flex items-center gap-2 bg-card border border-border px-3 py-1.5 rounded-md shadow-sm">
              <TableProperties className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-mono font-medium text-foreground">
                {liveData.length} Rows
              </span>
            </div>
          </div>
          <div className="flex-1 overflow-auto custom-scrollbar p-4 bg-muted/10">
            {liveData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4 opacity-50">
                <Activity className="w-8 h-8 animate-pulse" />
                <p className="text-xs font-medium tracking-wide">
                  Awaiting payload...
                </p>
              </div>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden bg-card shadow-sm">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        <th className="px-4 py-3 font-semibold text-muted-foreground w-12 border-r border-border">
                          #
                        </th>
                        {getTableHeaders().map((h, i) => (
                          <th
                            key={i}
                            className="px-4 py-3 font-semibold text-foreground border-r border-border"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {liveData.map((row, idx) => (
                        <tr
                          key={idx}
                          className="hover:bg-muted/30 transition-colors"
                        >
                          <td className="px-4 py-3 text-muted-foreground font-mono border-r border-border">
                            {idx + 1}
                          </td>
                          {getTableHeaders().map((h, i) => (
                            <td
                              key={i}
                              className="px-4 py-3 max-w-[250px] truncate border-r border-border text-foreground/80"
                              title={row[h]}
                            >
                              {row[h] || "-"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </main>
      ) : (
        <main className="flex-1 overflow-y-auto p-5 space-y-8 custom-scrollbar">
          {suggestedRecipe && (
            <div className="p-3.5 bg-muted border border-border shadow-sm rounded-lg flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5 text-foreground">
                <Bookmark className="w-4 h-4 text-muted-foreground" />{" "}
                <span className="text-xs font-semibold">
                  Found template: {suggestedRecipe.name}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => setSuggestedRecipe(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 px-3 text-xs font-medium shadow-sm"
                  onClick={() => loadRecipe(suggestedRecipe)}
                >
                  Load
                </Button>
              </div>
            </div>
          )}

          <section className="space-y-5">
            <h2 className="text-xs font-bold tracking-widest uppercase text-muted-foreground">
              Surface Data
            </h2>
            <div className="space-y-2.5">
              <Label className="text-[11px] font-semibold text-foreground">
                Row Container
              </Label>
              <Button
                onClick={() => toggleScraper("container", "surface")}
                disabled={isScraping}
                variant="outline"
                className={`w-full justify-start h-auto py-3 px-4 border-dashed shadow-sm ${containerSelector ? "border-solid bg-muted/50" : "hover:bg-muted/50"}`}
              >
                <div className="flex items-center gap-3 w-full">
                  {containerSelector ? (
                    <Check className="w-4 h-4 text-foreground" />
                  ) : (
                    <MousePointer2 className="w-4 h-4 text-muted-foreground" />
                  )}
                  <div className="flex flex-col items-start flex-1">
                    <span className="text-xs font-medium text-foreground">
                      {containerSelector
                        ? "Container Locked"
                        : "Select List Item Container"}
                    </span>
                    {containerSelector && (
                      <span className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        {containerCount} rows detected
                      </span>
                    )}
                  </div>
                </div>
              </Button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-semibold text-foreground">
                  Data Columns
                </Label>
                <Button
                  onClick={() => toggleScraper("column", "surface")}
                  disabled={isScraping}
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                >
                  + Add Column
                </Button>
              </div>
              <div className="space-y-4">
                {scrapedNodes.length === 0 && (
                  <div className="text-center py-8 border border-dashed border-border rounded-lg text-muted-foreground text-xs shadow-sm">
                    No columns defined.
                  </div>
                )}
                {scrapedNodes.map((node) =>
                  renderNodeControls(node, "surface", scrapedNodes),
                )}
              </div>
            </div>
          </section>

          <section className="space-y-5 pt-6 border-t border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Layers
                  className={`w-4 h-4 ${isDeepScrapeEnabled ? "text-foreground" : "text-muted-foreground"}`}
                />
                <h2
                  className={`text-xs font-bold tracking-widest uppercase ${isDeepScrapeEnabled ? "text-foreground" : "text-muted-foreground"}`}
                >
                  Deep Scrape
                </h2>
              </div>
              <div className="flex items-center space-x-2 bg-muted px-2 py-1 rounded border border-border shadow-sm">
                <Label
                  className="text-[10px] uppercase font-semibold text-foreground cursor-pointer"
                  htmlFor="deep-toggle"
                >
                  Enable
                </Label>
                <input
                  id="deep-toggle"
                  type="checkbox"
                  checked={isDeepScrapeEnabled}
                  onChange={(e) => setIsDeepScrapeEnabled(e.target.checked)}
                  className="accent-foreground w-3.5 h-3.5 cursor-pointer"
                />
              </div>
            </div>
            {isDeepScrapeEnabled && (
              <div className="p-5 bg-card border border-border shadow-sm rounded-xl space-y-6 animate-in fade-in slide-in-from-top-2">
                <div className="space-y-2">
                  <Label className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5 text-muted-foreground" />{" "}
                    Target URL Source
                  </Label>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Select which column from the Surface data contains the link
                    to the profile page.
                  </p>
                  <Select
                    disabled={isScraping}
                    value={deepLinkColumn}
                    onValueChange={setDeepLinkColumn}
                  >
                    <SelectTrigger className="w-full h-9 text-xs bg-background border-border shadow-sm">
                      <SelectValue placeholder="Select URL Column..." />
                    </SelectTrigger>
                    <SelectContent className="z-[9999] border-border">
                      {scrapedNodes.map((n) => (
                        <SelectItem
                          key={n.id}
                          value={n.columnName}
                          className="text-xs"
                        >
                          {n.columnName} (Attribute: {n.attribute})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3 pt-4 border-t border-border">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-semibold text-foreground">
                      Deep Data Extractors
                    </Label>
                    <Button
                      onClick={() => toggleScraper("column", "deep")}
                      disabled={isScraping}
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                    >
                      + Add Detail Column
                    </Button>
                  </div>
                  <div className="space-y-4">
                    {deepNodes.length === 0 && (
                      <div className="text-center py-6 border border-dashed border-border rounded-lg text-muted-foreground text-[10px] shadow-sm px-4">
                        Navigate to a profile page, then define deep columns
                        here.
                      </div>
                    )}
                    {deepNodes.map((node) =>
                      renderNodeControls(node, "deep", deepNodes),
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="space-y-4 pt-6 border-t border-border">
            <h2 className="text-xs font-bold tracking-widest uppercase text-muted-foreground">
              Navigation
            </h2>
            <div className="p-5 bg-card border border-border shadow-sm rounded-xl space-y-5">
              <div className="space-y-2">
                <Label className="text-[11px] font-semibold text-foreground">
                  Pagination Mode
                </Label>
                <Select
                  disabled={isScraping}
                  value={navMode}
                  onValueChange={(val: NavMode) => setNavMode(val)}
                >
                  <SelectTrigger className="w-full h-9 text-xs bg-background border-border shadow-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[9999] border-border">
                    <SelectItem value="none" className="text-xs">
                      <span className="flex items-center gap-2">
                        <Ban className="w-3.5 h-3.5 text-muted-foreground" />{" "}
                        Single Page Only
                      </span>
                    </SelectItem>
                    <SelectItem value="next" className="text-xs">
                      <span className="flex items-center gap-2">
                        <ArrowRightToLine className="w-3.5 h-3.5 text-muted-foreground" />{" "}
                        Click 'Next Page'
                      </span>
                    </SelectItem>
                    <SelectItem value="loadMore" className="text-xs">
                      <span className="flex items-center gap-2">
                        <MousePointerClick className="w-3.5 h-3.5 text-muted-foreground" />{" "}
                        Click 'Load More'
                      </span>
                    </SelectItem>
                    <SelectItem value="infinite" className="text-xs">
                      <span className="flex items-center gap-2">
                        <ArrowDownToLine className="w-3.5 h-3.5 text-muted-foreground" />{" "}
                        Infinite Scroll
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(navMode === "next" || navMode === "loadMore") && (
                <div className="space-y-2 pt-4 border-t border-border">
                  <Label className="text-[11px] font-semibold text-foreground">
                    Target Button
                  </Label>
                  <Button
                    onClick={() => toggleScraper("pagination")}
                    disabled={isScraping}
                    variant="outline"
                    size="sm"
                    className={`w-full text-xs h-9 border-dashed shadow-sm ${paginationSelectors ? "border-solid bg-muted/50" : "hover:bg-muted/50"}`}
                  >
                    {paginationSelectors ? (
                      <span className="flex items-center gap-1.5 font-medium">
                        <Wand2 className="w-3.5 h-3.5" /> Robust Selection
                        Locked
                      </span>
                    ) : (
                      "+ Select Button on Page"
                    )}
                  </Button>
                </div>
              )}
              {navMode !== "none" && (
                <div className="space-y-3 pt-4 border-t border-border">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-semibold text-foreground">
                      Scrape Limit
                    </Label>
                    <Select
                      disabled={isScraping}
                      value={pageLimitMode}
                      onValueChange={(val: "all" | "custom") =>
                        setPageLimitMode(val)
                      }
                    >
                      <SelectTrigger className="w-[120px] h-8 text-xs bg-background shadow-sm border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="z-[9999] border-border">
                        <SelectItem value="custom" className="text-xs">
                          Custom Limit
                        </SelectItem>
                        <SelectItem value="all" className="text-xs">
                          Exhaust Site
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {pageLimitMode === "custom" && (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-muted-foreground font-medium">
                        Max Passes
                      </span>
                      <Input
                        disabled={isScraping}
                        type="number"
                        value={maxPages}
                        onChange={(e) => setMaxPages(Number(e.target.value))}
                        className="w-20 h-8 text-xs bg-background border-border shadow-sm text-center font-mono"
                        min={1}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </main>
      )}

      {/* FOOTER ACTION AREA */}
      <footer className="px-5 py-4 border-t border-border bg-background/90 backdrop-blur-md z-10 shrink-0 space-y-3">
        {isScraping ? (
          <div className="flex gap-3">
            <Button
              onClick={() => {
                pauseController.current = !pauseController.current
                setIsPaused(pauseController.current)
              }}
              variant={isPaused ? "secondary" : "outline"}
              className={`flex-1 h-10 shadow-sm font-semibold flex items-center justify-center gap-2 transition-colors ${isPaused ? "border-border" : "border-border bg-background"}`}
            >
              {isPaused ? (
                <>
                  <Play className="w-4 h-4 fill-current" /> Resume
                </>
              ) : (
                <>
                  <Pause className="w-4 h-4 fill-current" /> Pause
                </>
              )}
            </Button>
            <Button
              onClick={() => {
                abortController.current = true
              }}
              variant="destructive"
              className="flex-1 h-10 shadow-sm font-semibold flex items-center justify-center gap-2"
            >
              <Square className="w-4 h-4 fill-current" /> Stop & Export
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              <Button
                disabled={scrapedNodes.length === 0}
                onClick={() => handleScrapeAndDownload("test")}
                variant="secondary"
                className="flex-1 h-9 text-xs font-semibold shadow-sm"
              >
                <FlaskConical className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />{" "}
                Test Run
              </Button>
              {(scrapedNodes.length > 0 || deepNodes.length > 0) && (
                <Button
                  variant="ghost"
                  onClick={handleSaveRecipe}
                  className="h-9 px-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  <Save className="w-3.5 h-3.5 mr-1.5" /> Save
                </Button>
              )}
            </div>

            <div className="flex gap-3">
              <Select
                disabled={scrapedNodes.length === 0}
                value={exportFormat}
                onValueChange={(val: "csv" | "json") => {
                  setExportFormat(val)
                  saveSettings("defaultExportFormat", val)
                }}
              >
                <SelectTrigger className="w-[100px] h-10 text-xs bg-muted border-border font-semibold shadow-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[9999] border-border">
                  <SelectItem
                    value="json"
                    className="text-xs font-mono font-medium"
                  >
                    .JSON
                  </SelectItem>
                  <SelectItem
                    value="csv"
                    className="text-xs font-mono font-medium"
                  >
                    .CSV
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                disabled={scrapedNodes.length === 0}
                onClick={() => handleScrapeAndDownload("full")}
                className="flex-1 h-10 shadow-sm font-semibold flex items-center justify-center gap-2 bg-foreground text-background hover:bg-foreground/90 transition-colors"
              >
                <ExternalLink className="w-4 h-4" /> Start Background Scrape
              </Button>
            </div>
          </div>
        )}
      </footer>
    </div>
  )
}

export default App
