import {
  Activity,
  ArrowDownToLine,
  ArrowRightToLine,
  Ban,
  Bookmark,
  BoxSelect,
  Check,
  Clock,
  Download,
  ExternalLink,
  Keyboard,
  Layers,
  Link2,
  MousePointer2,
  MousePointerClick,
  Plus,
  Save,
  Settings,
  Square,
  TableProperties,
  Trash2,
  Upload,
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

// UPGRADED SCHEMA: Supports dual-selectors
interface ScrapedNode {
  id: string
  selector: string // The active selector
  patternSelector: string
  exactSelector: string
  count: number // The active count
  patternCount: number
  exactCount: number
  isExact: boolean
  columnName: string
  attribute: string
  availableAttributes: { name: string; preview: string }[]
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
  pagination: string | null
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

  const [scrapedNodes, setScrapedNodes] = useState<ScrapedNode[]>([])
  const [containerSelector, setContainerSelector] = useState<string | null>(
    null,
  )
  const [containerCount, setContainerCount] = useState<number>(0)

  const [navMode, setNavMode] = useState<NavMode>("none")
  const [paginationSelector, setPaginationSelector] = useState<string | null>(
    null,
  )

  const [isDeepScrapeEnabled, setIsDeepScrapeEnabled] = useState(false)
  const [deepNodes, setDeepNodes] = useState<ScrapedNode[]>([])
  const [deepLinkColumn, setDeepLinkColumn] = useState<string>("")

  const [pageLimitMode, setPageLimitMode] = useState<"custom" | "all">("custom")
  const [maxPages, setMaxPages] = useState<number>(3)
  const [exportFormat, setExportFormat] = useState<"csv" | "json">("json")

  const [activeDomain, setActiveDomain] = useState<string>("")
  const [recipes, setRecipes] = useState<Record<string, Recipe[]>>({})
  const [suggestedRecipe, setSuggestedRecipe] = useState<Recipe | null>(null)

  const [showRecipeManager, setShowRecipeManager] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortController = useRef(false)

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
            ["scrapy_recipes", "scrapy_settings"],
            (result) => {
              if (result.scrapy_recipes) {
                setRecipes(result.scrapy_recipes)
                if (
                  result.scrapy_recipes[domain] &&
                  result.scrapy_recipes[domain].length > 0
                )
                  setSuggestedRecipe(result.scrapy_recipes[domain][0])
              }
              if (result.scrapy_settings?.defaultExportFormat)
                setExportFormat(result.scrapy_settings.defaultExportFormat)
            },
          )
        } catch (e) {}
      }
    }
    init()

    const handleMessage = (message: any) => {
      if (message.action === "ELEMENTS_SELECTED") {
        setIsSelecting(false)
        const newNode: ScrapedNode = {
          id: crypto.randomUUID(),
          selector: message.payload.patternSelector,
          patternSelector: message.payload.patternSelector,
          exactSelector: message.payload.exactSelector,
          count: message.payload.patternCount,
          patternCount: message.payload.patternCount,
          exactCount: message.payload.exactCount,
          isExact: false, // Default to pattern matching
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
        setPaginationSelector(message.payload.selector)
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

  const saveSettings = (format: "csv" | "json") => {
    setExportFormat(format)
    chrome.storage.local.set({
      scrapy_settings: { defaultExportFormat: format },
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
      pagination: paginationSelector,
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
    setPaginationSelector(recipe.pagination)
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
    setPaginationSelector(null)
    setContainerSelector(null)
    setIsDeepScrapeEnabled(false)
    setNavMode("none")
    setLiveData([])
    chrome.tabs
      .query({ active: true, lastFocusedWindow: true })
      .then(
        ([tab]) =>
          tab?.id &&
          chrome.tabs.sendMessage(tab.id, { action: "CLEAR_SELECTION" }),
      )
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

  const handleScrapeAndDownload = async () => {
    abortController.current = false
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
          setStatusText("Aborted.")
          break
        }
        setStatusText(`Extracting Surface Data (Page ${currentPage})...`)
        await new Promise((resolve) =>
          chrome.tabs.sendMessage(
            workerTabId,
            { action: "SCROLL_PAGE" },
            resolve,
          ),
        )
        await randomSleep(800, 1500)

        const scrapeRes: any = await new Promise((resolve) =>
          chrome.tabs.sendMessage(
            workerTabId,
            {
              action: "EXECUTE_SCRAPE",
              payload: { schema: scrapedNodes, containerSelector },
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

        if (
          abortController.current ||
          navMode === "none" ||
          (pageLimitMode === "custom" && currentPage >= maxPages)
        )
          break

        if (navMode === "infinite") {
          setStatusText(`Scrolling down...`)
          await randomSleep(3000, 5000)
          currentPage++
        } else if (navMode === "loadMore") {
          if (!paginationSelector) break
          setStatusText(`Clicking Load More...`)
          const clickRes: any = await new Promise((resolve) =>
            chrome.tabs.sendMessage(
              workerTabId,
              {
                action: "CLICK_NEXT",
                payload: { selector: paginationSelector },
              },
              resolve,
            ),
          )
          if (clickRes?.status !== "success") break
          await randomSleep(3000, 5000)
          currentPage++
        } else if (navMode === "next") {
          if (!paginationSelector) break
          setStatusText(`Navigating to page ${currentPage + 1}...`)
          const clickRes: any = await new Promise((resolve) =>
            chrome.tabs.sendMessage(
              workerTabId,
              {
                action: "CLICK_NEXT",
                payload: { selector: paginationSelector },
              },
              resolve,
            ),
          )
          if (clickRes?.status !== "success") break
          await randomSleep(4000, 6000)
          currentPage++
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
            setStatusText("Deep Scrape Aborted.")
            break
          }
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
              { action: "EXECUTE_SCRAPE", payload: { schema: deepNodes } },
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
          await randomSleep(2000, 4000)
        }
      }

      setStatusText(`Generating ${exportFormat.toUpperCase()}...`)
      if (currentDataState.length > 0) {
        let blob: Blob
        let filename: string
        if (exportFormat === "csv") {
          blob = new Blob([convertToCSV(currentDataState)], {
            type: "text/csv;charset=utf-8;",
          })
          filename = `scrapy_export_${Date.now()}.csv`
        } else {
          blob = new Blob([JSON.stringify(currentDataState, null, 2)], {
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
  ) => {
    const activePreview =
      node.availableAttributes.find((a) => a.name === node.attribute)
        ?.preview || "No data."
    const setNodes = target === "surface" ? setScrapedNodes : setDeepNodes
    const isNodeActionSelecting =
      isSelecting && activeActionTargetRef.current?.colId === node.id

    return (
      <div
        key={node.id}
        className="p-3.5 bg-secondary/10 rounded-xl border border-border/30 group"
      >
        <div className="flex items-start justify-between mb-3">
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
              className="bg-transparent border-transparent hover:border-border focus:border-border h-7 text-sm font-medium px-1 -ml-1 shadow-none rounded-md"
            />
            <div className="flex items-center gap-2 px-1">
              <p className="text-[10px] text-muted-foreground font-mono">
                {node.count} matches
              </p>
              {/* NEW: STRICT EXACT MATCH TOGGLE */}
              <div className="flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
                <input
                  type="checkbox"
                  checked={node.isExact || false}
                  onChange={(e) => {
                    const exact = e.target.checked
                    setNodes((prev) =>
                      prev.map((n) =>
                        n.id === node.id
                          ? {
                              ...n,
                              isExact: exact,
                              selector: exact
                                ? n.exactSelector || n.selector
                                : n.patternSelector || n.selector,
                              count: exact
                                ? n.exactCount || n.count
                                : n.patternCount || n.count,
                            }
                          : n,
                      ),
                    )
                  }}
                  className="accent-primary w-2.5 h-2.5 rounded-sm"
                />
                <Label className="text-[9px] text-muted-foreground cursor-pointer uppercase tracking-wider">
                  Strict Path
                </Label>
              </div>
            </div>
          </div>
          <Button
            disabled={isScraping}
            onClick={() =>
              setNodes((prev) => prev.filter((n) => n.id !== node.id))
            }
            variant="ghost"
            size="icon"
            className="w-6 h-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground w-16 shrink-0">
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
            <SelectTrigger className="flex-1 h-7 text-xs bg-background border-border/50 shadow-sm capitalize rounded-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-border">
              {node.availableAttributes.map((attr) => (
                <SelectItem
                  key={attr.name}
                  value={attr.name}
                  className="capitalize text-xs"
                >
                  {attr.name === "text" ? "Text (Inner)" : attr.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="bg-black/20 rounded-md p-2 border border-border/20 mb-3">
          <p
            className="text-[10px] text-muted-foreground font-mono truncate"
            title={activePreview}
          >
            {activePreview}
          </p>
        </div>

        <div className="pt-2 border-t border-border/50 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Pre-Scrape Actions
            </Label>
            <Select
              onValueChange={(val: any) => addAction(node.id, val, target)}
              value=""
            >
              <SelectTrigger className="h-6 w-24 text-[10px] bg-background border-none shadow-none">
                <span className="flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Action
                </span>
              </SelectTrigger>
              <SelectContent className="border-border">
                <SelectItem
                  value="click"
                  className="text-xs flex items-center gap-2"
                >
                  <MousePointerClick className="w-3 h-3 inline mr-1 text-rose-500" />{" "}
                  Click
                </SelectItem>
                <SelectItem
                  value="type"
                  className="text-xs flex items-center gap-2"
                >
                  <Keyboard className="w-3 h-3 inline mr-1 text-blue-500" />{" "}
                  Type Text
                </SelectItem>
                <SelectItem
                  value="wait"
                  className="text-xs flex items-center gap-2"
                >
                  <Clock className="w-3 h-3 inline mr-1 text-amber-500" /> Wait
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
                  className="flex flex-col gap-1.5 bg-background/50 p-2 rounded border border-border/40 relative group/action"
                >
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute top-1 right-1 w-4 h-4 text-muted-foreground hover:text-destructive opacity-0 group-hover/action:opacity-100"
                    onClick={() => removeAction(node.id, action.id, target)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                  <div className="flex items-center gap-1.5">
                    {action.type === "click" && (
                      <MousePointerClick className="w-3 h-3 text-rose-500" />
                    )}
                    {action.type === "wait" && (
                      <Clock className="w-3 h-3 text-amber-500" />
                    )}
                    {action.type === "type" && (
                      <Keyboard className="w-3 h-3 text-blue-500" />
                    )}
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                      {action.type}
                    </span>
                  </div>
                  {action.type === "wait" ? (
                    <div className="flex items-center gap-2 mt-1">
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
                        className="h-6 text-[10px] w-20 bg-background"
                      />{" "}
                      <span className="text-[10px] text-muted-foreground">
                        ms
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-1.5 mt-1 pr-4">
                      {action.selector ? (
                        <div className="flex items-center gap-1">
                          <span
                            className="text-[10px] font-mono text-muted-foreground truncate flex-1 block"
                            title={action.selector}
                          >
                            {action.selector}
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="w-4 h-4 shrink-0"
                            onClick={() =>
                              toggleScraper("clickAction", target, {
                                colId: node.id,
                                actionId: action.id,
                              })
                            }
                          >
                            <MousePointer2 className="w-3 h-3 hover:text-primary" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className={`h-6 text-[10px] w-full border-dashed ${isThisActionSelecting ? "border-rose-500 text-rose-500 bg-rose-500/10" : ""}`}
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
                          className="h-6 text-[10px] bg-background"
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
    const surfaceHeaders = scrapedNodes.map((n) => n.columnName)
    const deepHeaders = isDeepScrapeEnabled
      ? deepNodes.map((n) => n.columnName)
      : []
    return [...surfaceHeaders, ...deepHeaders]
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-sans selection:bg-primary/20">
      {showSettings && (
        <div className="absolute inset-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 flex flex-col">
          <header className="flex items-center justify-between px-4 py-3 border-b border-border/40">
            <h2 className="text-sm font-semibold text-primary flex items-center gap-2">
              <Settings className="w-4 h-4" /> Global Settings
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="w-6 h-6 hover:bg-secondary/50"
              onClick={() => setShowSettings(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </header>
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground">
                Default Export Format
              </Label>
              <Select
                value={exportFormat}
                onValueChange={(val: "csv" | "json") => saveSettings(val)}
              >
                <SelectTrigger className="w-full bg-background border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-border">
                  <SelectItem value="json">.JSON (APIs/n8n)</SelectItem>
                  <SelectItem value="csv">.CSV (Spreadsheets)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {showRecipeManager && (
        <div className="absolute inset-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 flex flex-col">
          <header className="flex items-center justify-between px-4 py-3 border-b border-border/40">
            <h2 className="text-sm font-semibold text-primary flex items-center gap-2">
              <Bookmark className="w-4 h-4" /> Saved Recipes
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="w-6 h-6 hover:bg-secondary/50"
              onClick={() => setShowRecipeManager(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </header>

          <div className="px-4 py-3 border-b border-border/30 bg-secondary/5 flex gap-2">
            <Button
              onClick={exportAllRecipes}
              variant="outline"
              size="sm"
              className="flex-1 text-xs h-8 border-border/50"
            >
              <Download className="w-3.5 h-3.5 mr-2" /> Export Backup
            </Button>
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              size="sm"
              className="flex-1 text-xs h-8 border-border/50"
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

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {Object.keys(recipes).length === 0 && (
              <p className="text-xs text-muted-foreground text-center mt-10">
                No recipes saved yet.
              </p>
            )}
            {Object.entries(recipes).map(([domain, domainRecipes]) => (
              <div key={domain} className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  {domain}
                </p>
                {domainRecipes.map((recipe) => (
                  <div
                    key={recipe.id}
                    className="flex items-center justify-between p-3 bg-secondary/10 border border-border/30 rounded-lg group"
                  >
                    <div>
                      <p className="text-xs font-medium text-foreground">
                        {recipe.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {recipe.schema.length} cols • {recipe.navMode}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteRecipe(domain, recipe.id)}
                        className="h-7 text-xs text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        Delete
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => loadRecipe(recipe)}
                        className="h-7 text-xs bg-primary text-primary-foreground"
                      >
                        Load
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <header className="flex items-center justify-between px-4 py-3 border-b border-border/40 shrink-0 bg-background/95 backdrop-blur z-10">
        <div className="flex items-center gap-2 text-primary">
          <BoxSelect className="w-4 h-4" />{" "}
          <span className="text-sm font-medium tracking-tight">
            Web Scrapy Engine
          </span>
        </div>
        {!isScraping && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSettings(true)}
              className="w-7 h-7 text-muted-foreground hover:text-foreground"
            >
              <Settings className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowRecipeManager(true)}
              className="h-7 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground flex gap-1"
            >
              Recipes{" "}
              <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded text-[8px]">
                {Object.values(recipes).flat().length}
              </span>
            </Button>
            {(scrapedNodes.length > 0 || deepNodes.length > 0) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                className="h-7 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-destructive"
              >
                Clear
              </Button>
            )}
          </div>
        )}
      </header>

      {isScraping ? (
        <main className="flex-1 flex flex-col overflow-hidden bg-background">
          <div className="p-4 border-b border-border/40 flex items-center justify-between bg-secondary/5">
            <div className="flex items-center gap-3">
              <Activity className="w-4 h-4 text-primary animate-pulse" />
              <span className="text-xs font-semibold text-primary">
                {statusText}
              </span>
            </div>
            <div className="flex items-center gap-1.5 bg-background border border-border/50 px-2.5 py-1 rounded-md">
              <TableProperties className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-mono text-muted-foreground">
                {liveData.length} Rows
              </span>
            </div>
          </div>
          <div className="flex-1 overflow-auto custom-scrollbar p-4">
            {liveData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-3 opacity-50">
                <Activity className="w-8 h-8 animate-pulse" />
                <p className="text-xs font-medium">
                  Awaiting first payload from worker...
                </p>
              </div>
            ) : (
              <div className="border border-border/40 rounded-lg overflow-hidden bg-background shadow-sm">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-secondary/20 border-b border-border/40">
                      <tr>
                        <th className="px-3 py-2 font-medium text-muted-foreground w-12 border-r border-border/20">
                          #
                        </th>
                        {getTableHeaders().map((h, i) => (
                          <th
                            key={i}
                            className="px-3 py-2 font-medium text-muted-foreground border-r border-border/20 last:border-0"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {liveData.map((row, idx) => (
                        <tr
                          key={idx}
                          className="border-b border-border/20 last:border-0 hover:bg-secondary/10 transition-colors"
                        >
                          <td className="px-3 py-2 text-muted-foreground font-mono border-r border-border/20">
                            {idx + 1}
                          </td>
                          {getTableHeaders().map((h, i) => (
                            <td
                              key={i}
                              className="px-3 py-2 max-w-[200px] truncate border-r border-border/20 last:border-0"
                              title={row[h]}
                            >
                              {row[h] || (
                                <span className="text-muted-foreground/30">
                                  -
                                </span>
                              )}
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
        <main className="flex-1 overflow-y-auto p-4 space-y-8 custom-scrollbar">
          {suggestedRecipe && (
            <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-primary">
                <Bookmark className="w-4 h-4" />{" "}
                <span className="text-xs font-medium">
                  Found template: {suggestedRecipe.name}
                </span>
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-primary hover:bg-primary/20"
                  onClick={() => setSuggestedRecipe(null)}
                >
                  <X className="w-3 h-3" />
                </Button>
                <Button
                  size="sm"
                  className="h-6 text-[10px] px-2 bg-primary text-primary-foreground"
                  onClick={() => loadRecipe(suggestedRecipe)}
                >
                  Load
                </Button>
              </div>
            </div>
          )}

          <section className="space-y-4 pb-4 border-b border-border/40">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-wide text-foreground">
                Surface Data (List Page)
              </h2>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Row Container
              </Label>
              <Button
                onClick={() => toggleScraper("container", "surface")}
                disabled={isScraping}
                variant="outline"
                className={`w-full justify-start h-auto py-2 px-3 border-dashed ${containerSelector ? "border-solid bg-secondary/20" : ""}`}
              >
                <div className="flex items-center gap-3 w-full">
                  {containerSelector ? (
                    <Check className="w-4 h-4 text-primary" />
                  ) : (
                    <MousePointer2 className="w-4 h-4 text-muted-foreground" />
                  )}
                  <div className="flex flex-col items-start flex-1">
                    <span className="text-xs">
                      {containerSelector
                        ? "Container Locked"
                        : "Select List Item Container"}
                    </span>
                    {containerSelector && (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {containerCount} rows detected
                      </span>
                    )}
                  </div>
                </div>
              </Button>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Columns</Label>
                <Button
                  onClick={() => toggleScraper("column", "surface")}
                  disabled={isScraping}
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px]"
                >
                  + Add Column
                </Button>
              </div>
              <div className="space-y-3">
                {scrapedNodes.length === 0 && (
                  <div className="text-center py-4 border border-dashed border-border/40 rounded-lg text-muted-foreground text-xs">
                    No columns defined.
                  </div>
                )}
                {scrapedNodes.map((node) =>
                  renderNodeControls(node, "surface"),
                )}
              </div>
            </div>
          </section>

          <section className="space-y-4 pb-4 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers
                  className={`w-4 h-4 ${isDeepScrapeEnabled ? "text-indigo-400" : "text-muted-foreground"}`}
                />
                <h2
                  className={`text-sm font-semibold tracking-wide ${isDeepScrapeEnabled ? "text-indigo-400" : "text-foreground"}`}
                >
                  Deep Scrape (Profiles)
                </h2>
              </div>
              <div className="flex items-center space-x-2">
                <Label className="text-[10px] uppercase text-muted-foreground">
                  Enable
                </Label>
                <input
                  type="checkbox"
                  checked={isDeepScrapeEnabled}
                  onChange={(e) => setIsDeepScrapeEnabled(e.target.checked)}
                  className="accent-indigo-500 w-4 h-4"
                />
              </div>
            </div>
            {isDeepScrapeEnabled && (
              <div className="p-4 bg-indigo-950/10 border border-indigo-900/30 rounded-xl space-y-4 animate-in fade-in slide-in-from-top-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-indigo-300 flex items-center gap-1.5">
                    <Link2 className="w-3 h-3" /> Target URL Source
                  </Label>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Select which column from the Surface data contains the link
                    to the profile page.
                  </p>
                  <Select
                    disabled={isScraping}
                    value={deepLinkColumn}
                    onValueChange={setDeepLinkColumn}
                  >
                    <SelectTrigger className="w-full h-8 text-xs bg-background border-border/50">
                      <SelectValue placeholder="Select URL Column..." />
                    </SelectTrigger>
                    <SelectContent className="border-border">
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
                <div className="space-y-2 pt-2 border-t border-indigo-900/20">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-indigo-300">
                      Deep Data Extractors
                    </Label>
                    <Button
                      onClick={() => toggleScraper("column", "deep")}
                      disabled={isScraping}
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] text-indigo-400 hover:text-indigo-300"
                    >
                      + Add Detail Column
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {deepNodes.length === 0 && (
                      <div className="text-center py-4 border border-dashed border-indigo-900/40 rounded-lg text-indigo-400/50 text-[10px]">
                        Navigate to a profile page, then define deep columns
                        here.
                      </div>
                    )}
                    {deepNodes.map((node) => renderNodeControls(node, "deep"))}
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between text-muted-foreground">
              <h2 className="text-sm font-semibold tracking-wide text-foreground">
                Navigation & Pagination
              </h2>
            </div>
            <div className="p-3.5 bg-secondary/10 border border-border/30 rounded-xl space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Mode</Label>
                <Select
                  disabled={isScraping}
                  value={navMode}
                  onValueChange={(val: NavMode) => setNavMode(val)}
                >
                  <SelectTrigger className="w-full h-8 text-xs bg-background border-border/50 shadow-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border">
                    <SelectItem
                      value="none"
                      className="text-xs flex items-center gap-2"
                    >
                      <Ban className="w-3 h-3 inline mr-1" /> Single Page Only
                    </SelectItem>
                    <SelectItem
                      value="next"
                      className="text-xs flex items-center gap-2"
                    >
                      <ArrowRightToLine className="w-3 h-3 inline mr-1" /> Click
                      'Next Page'
                    </SelectItem>
                    <SelectItem
                      value="loadMore"
                      className="text-xs flex items-center gap-2"
                    >
                      <MousePointerClick className="w-3 h-3 inline mr-1" />{" "}
                      Click 'Load More'
                    </SelectItem>
                    <SelectItem
                      value="infinite"
                      className="text-xs flex items-center gap-2"
                    >
                      <ArrowDownToLine className="w-3 h-3 inline mr-1" />{" "}
                      Infinite Scroll
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(navMode === "next" || navMode === "loadMore") && (
                <div className="space-y-1.5 pt-2 border-t border-border/30">
                  <Label className="text-xs text-muted-foreground">
                    Target Button
                  </Label>
                  <Button
                    onClick={() => toggleScraper("pagination")}
                    disabled={isScraping}
                    variant="outline"
                    size="sm"
                    className={`w-full text-xs h-8 border-dashed ${paginationSelector ? "border-solid bg-background" : ""}`}
                  >
                    {paginationSelector
                      ? "Target Locked"
                      : "+ Select Button on Page"}
                  </Button>
                </div>
              )}
              {navMode !== "none" && (
                <div className="space-y-2 pt-2 border-t border-border/30">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">
                      Scrape Limit
                    </Label>
                    <Select
                      disabled={isScraping}
                      value={pageLimitMode}
                      onValueChange={(val: "all" | "custom") =>
                        setPageLimitMode(val)
                      }
                    >
                      <SelectTrigger className="w-[110px] h-7 text-xs bg-background shadow-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-border">
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
                      <span className="text-xs text-muted-foreground">
                        Max passes
                      </span>
                      <Input
                        disabled={isScraping}
                        type="number"
                        value={maxPages}
                        onChange={(e) => setMaxPages(Number(e.target.value))}
                        className="w-16 h-7 text-xs bg-background text-center px-1"
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

      <footer className="px-4 py-4 border-t border-border/40 shrink-0 bg-background/95 backdrop-blur z-10 space-y-3">
        {isScraping ? (
          <Button
            onClick={() => {
              abortController.current = true
            }}
            variant="destructive"
            className="w-full h-10 shadow-sm rounded-lg flex items-center justify-center gap-2"
          >
            <Square className="w-4 h-4 fill-current" /> Abort Workload
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            {(scrapedNodes.length > 0 || deepNodes.length > 0) && (
              <div className="flex justify-end mb-1">
                <button
                  onClick={handleSaveRecipe}
                  className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 uppercase tracking-wider font-semibold transition-colors"
                >
                  <Save className="w-3 h-3" /> Save Template
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <Select
                disabled={scrapedNodes.length === 0}
                value={exportFormat}
                onValueChange={(val: "csv" | "json") => setExportFormat(val)}
              >
                <SelectTrigger className="w-[85px] h-10 text-xs bg-secondary/50 border-border/50 rounded-lg shadow-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-border min-w-[85px]">
                  <SelectItem value="json" className="text-xs font-mono">
                    .JSON
                  </SelectItem>
                  <SelectItem value="csv" className="text-xs font-mono">
                    .CSV
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                disabled={scrapedNodes.length === 0}
                onClick={() => handleScrapeAndDownload()}
                className="flex-1 h-10 rounded-lg shadow-sm font-medium flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
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
