import {
  Bookmark,
  BoxSelect,
  Check,
  ExternalLink,
  Layers,
  Link2,
  MousePointer2,
  MousePointerClick,
  Save,
  Square,
  Trash2,
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

interface ScrapedNode {
  id: string
  selector: string
  count: number
  columnName: string
  attribute: string
  availableAttributes: { name: string; preview: string }[]
  clickSelector?: string
}

// UPGRADED RECIPE INTERFACE to support Deep Scrape configurations
interface Recipe {
  id: string
  domain: string
  name: string
  schema: ScrapedNode[]
  deepSchema: ScrapedNode[]
  container: string | null
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
  const activeClickActionIdRef = useRef<string | null>(null)

  const [isScraping, setIsScraping] = useState(false)
  const [statusText, setStatusText] = useState("")

  const [scrapedNodes, setScrapedNodes] = useState<ScrapedNode[]>([])
  const [containerSelector, setContainerSelector] = useState<string | null>(
    null,
  )
  const [containerCount, setContainerCount] = useState<number>(0)
  const [paginationSelector, setPaginationSelector] = useState<string | null>(
    null,
  )

  const [isDeepScrapeEnabled, setIsDeepScrapeEnabled] = useState(false)
  const [deepNodes, setDeepNodes] = useState<ScrapedNode[]>([])
  const [deepLinkColumn, setDeepLinkColumn] = useState<string>("")

  const [pageLimitMode, setPageLimitMode] = useState<"custom" | "all">("custom")
  const [maxPages, setMaxPages] = useState<number>(3)
  const [exportFormat, setExportFormat] = useState<"csv" | "json">("json")

  // RESTORED RECIPE STATE
  const [activeDomain, setActiveDomain] = useState<string>("")
  const [recipes, setRecipes] = useState<Record<string, Recipe[]>>({})
  const [suggestedRecipe, setSuggestedRecipe] = useState<Recipe | null>(null)
  const [showRecipeManager, setShowRecipeManager] = useState(false)

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
          chrome.storage.local.get(["scrapy_recipes"], (result) => {
            if (result.scrapy_recipes) {
              setRecipes(result.scrapy_recipes)
              if (
                result.scrapy_recipes[domain] &&
                result.scrapy_recipes[domain].length > 0
              ) {
                setSuggestedRecipe(result.scrapy_recipes[domain][0])
              }
            }
          })
        } catch (e) {}
      }
    }
    init()

    const handleMessage = (message: any) => {
      if (message.action === "ELEMENTS_SELECTED") {
        setIsSelecting(false)
        const newNode: ScrapedNode = {
          id: crypto.randomUUID(),
          selector: message.payload.selector,
          count: message.payload.count,
          columnName: `Column ${Date.now().toString().slice(-4)}`,
          attribute: "text",
          availableAttributes: message.payload.attributes,
        }
        if (targetSchemaRef.current === "surface")
          setScrapedNodes((prev) => [...prev, newNode])
        else setDeepNodes((prev) => [...prev, newNode])
      }

      if (
        message.action === "ACTION_SELECTED" &&
        activeClickActionIdRef.current
      ) {
        setIsSelecting(false)
        const colId = activeClickActionIdRef.current
        if (targetSchemaRef.current === "surface")
          setScrapedNodes((prev) =>
            prev.map((n) =>
              n.id === colId
                ? { ...n, clickSelector: message.payload.selector }
                : n,
            ),
          )
        else
          setDeepNodes((prev) =>
            prev.map((n) =>
              n.id === colId
                ? { ...n, clickSelector: message.payload.selector }
                : n,
            ),
          )
        activeClickActionIdRef.current = null
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

  // RESTORED RECIPE FUNCTIONS
  const handleSaveRecipe = () => {
    const recipeName = prompt(
      "Enter a name for this recipe template:",
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
    setPaginationSelector(recipe.pagination)

    // Load Deep Scrape config if it exists
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

    chrome.storage.local.set({ scrapy_recipes: updatedRecipes }, () => {
      setRecipes(updatedRecipes)
    })
  }

  const toggleScraper = async (
    mode: "column" | "pagination" | "container" | "clickAction",
    target: "surface" | "deep" = "surface",
    colId?: string,
  ) => {
    targetSchemaRef.current = target
    activeClickActionIdRef.current = colId || null
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
    setSuggestedRecipe(null) // Hide banners

    let allData: any[] = []
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

      setStatusText("Spawning isolated worker window...")

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

      // PHASE 1: SURFACE SCRAPE
      while (keepScraping) {
        if (abortController.current) {
          setStatusText("Aborted.")
          break
        }

        setStatusText(`Scrolling Surface Page ${currentPage}...`)
        await new Promise((resolve) =>
          chrome.tabs.sendMessage(
            workerTabId,
            { action: "SCROLL_PAGE" },
            resolve,
          ),
        )

        setStatusText(`Extracting Surface Data ${currentPage}...`)
        const scrapeRes: any = await new Promise((resolve) => {
          chrome.tabs.sendMessage(
            workerTabId,
            {
              action: "EXECUTE_SCRAPE",
              payload: { schema: scrapedNodes, containerSelector },
            },
            resolve,
          )
        })

        if (scrapeRes?.status === "success" && scrapeRes.data) {
          allData = [...allData, ...scrapeRes.data]
        } else {
          break
        }

        if (abortController.current) break

        if (paginationSelector) {
          if (pageLimitMode === "custom" && currentPage >= maxPages) break
          setStatusText(`Clicking next page...`)
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
          chrome.tabs.sendMessage(workerTabId, { action: "BLOCK_UI" })
        } else {
          break
        }
      }

      // PHASE 2: DEEP SCRAPE
      if (
        !abortController.current &&
        isDeepScrapeEnabled &&
        deepLinkColumn &&
        deepNodes.length > 0
      ) {
        for (let i = 0; i < allData.length; i++) {
          if (abortController.current) {
            setStatusText("Deep Scrape Aborted.")
            break
          }

          const targetUrl = allData[i][deepLinkColumn]

          if (
            !targetUrl ||
            typeof targetUrl !== "string" ||
            !targetUrl.startsWith("http")
          ) {
            allData[i]["_deep_scrape_status"] = "Invalid URL"
            continue
          }

          setStatusText(
            `Deep Scraping Profile ${i + 1} of ${allData.length}...`,
          )

          const loadSuccess = await navigateAndWait(workerTabId, targetUrl)

          if (!loadSuccess) {
            allData[i]["_deep_scrape_status"] = "Timeout"
            continue
          }

          const deepRes: any = await new Promise((resolve) => {
            chrome.tabs.sendMessage(
              workerTabId,
              { action: "EXECUTE_SCRAPE", payload: { schema: deepNodes } },
              resolve,
            )
          })

          if (
            deepRes?.status === "success" &&
            deepRes.data &&
            deepRes.data.length > 0
          ) {
            allData[i] = { ...allData[i], ...deepRes.data[0] }
          } else {
            allData[i]["_deep_scrape_status"] = "Failed Extraction"
          }

          await randomSleep(2000, 4500)
        }
      }

      // PHASE 3: FINALIZATION
      setStatusText(`Generating ${exportFormat.toUpperCase()}...`)

      if (allData.length > 0) {
        let blob: Blob
        let filename: string
        if (exportFormat === "csv") {
          blob = new Blob([convertToCSV(allData)], {
            type: "text/csv;charset=utf-8;",
          })
          filename = `scrapy_export_${Date.now()}.csv`
        } else {
          blob = new Blob([JSON.stringify(allData, null, 2)], {
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
      if (workerWindowId) {
        chrome.windows
          .remove(workerWindowId)
          .catch((err) => console.error("Failed to close worker window", err))
      }
      setIsScraping(false)
      setStatusText("")
      abortController.current = false
    }
  }

  const renderNodeControls = (
    node: ScrapedNode,
    target: "surface" | "deep",
  ) => {
    const activePreview =
      node.availableAttributes.find((a) => a.name === node.attribute)
        ?.preview || "No data."
    const setNodes = target === "surface" ? setScrapedNodes : setDeepNodes

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
            <p className="text-[10px] text-muted-foreground font-mono px-1">
              {node.count} matches
            </p>
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

        <div className="bg-black/20 rounded-md p-2 border border-border/20 mb-2">
          <p
            className="text-[10px] text-muted-foreground font-mono truncate"
            title={activePreview}
          >
            {activePreview}
          </p>
        </div>

        <div className="pt-2 border-t border-border/50">
          {node.clickSelector ? (
            <div className="flex items-center justify-between bg-rose-950/20 px-2 py-1.5 rounded border border-rose-900/30">
              <div className="flex items-center gap-1.5 overflow-hidden">
                <MousePointerClick className="w-3 h-3 text-rose-500 shrink-0" />
                <span
                  className="text-[10px] text-rose-400 font-mono truncate"
                  title={node.clickSelector}
                >
                  {node.clickSelector}
                </span>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="w-5 h-5 ml-2 hover:bg-rose-950/50"
                onClick={() =>
                  setNodes((prev) =>
                    prev.map((n) =>
                      n.id === node.id ? { ...n, clickSelector: undefined } : n,
                    ),
                  )
                }
              >
                <X className="w-3 h-3 text-rose-400" />
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleScraper("clickAction", target, node.id)}
              className={`text-[10px] h-6 px-2 w-full justify-start ${isSelecting && activeClickActionIdRef.current === node.id ? "bg-rose-500/10 text-rose-400" : "text-muted-foreground hover:text-rose-400"}`}
            >
              {isSelecting && activeClickActionIdRef.current === node.id
                ? "Select target on page..."
                : "+ Pre-Scrape Click"}
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-sans selection:bg-primary/20">
      {/* RESTORED RECIPE MANAGER OVERLAY */}
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
                        {recipe.schema.length} columns defined
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
            {/* RESTORED RECIPES BUTTON */}
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

      <main className="flex-1 overflow-y-auto p-4 space-y-8 custom-scrollbar">
        {/* RESTORED SUGGESTED RECIPE BANNER */}
        {suggestedRecipe && !isScraping && (
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
              {scrapedNodes.map((node) => renderNodeControls(node, "surface"))}
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
                  Select which column from the Surface data contains the link to
                  the profile page.
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
                      Navigate to a profile page, then define deep columns here.
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
              Pagination
            </h2>
            <Button
              onClick={() => toggleScraper("pagination")}
              disabled={isScraping}
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
            >
              + Set Next Button
            </Button>
          </div>
          {paginationSelector && (
            <div className="p-3.5 bg-secondary/10 border border-border/30 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Scrape Limit</span>
                <Select
                  disabled={isScraping}
                  value={pageLimitMode}
                  onValueChange={(val: "all" | "custom") =>
                    setPageLimitMode(val)
                  }
                >
                  <SelectTrigger className="w-[110px] h-7 text-xs bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border">
                    <SelectItem value="custom" className="text-xs">
                      Custom Range
                    </SelectItem>
                    <SelectItem value="all" className="text-xs">
                      All Pages
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {pageLimitMode === "custom" && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-muted-foreground">
                    Pages to crawl
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
        </section>
      </main>

      <footer className="px-4 py-4 border-t border-border/40 shrink-0 bg-background/95 backdrop-blur z-10 space-y-3">
        {statusText && (
          <p className="text-[10px] uppercase tracking-wider text-primary text-center font-bold animate-pulse">
            {statusText}
          </p>
        )}
        {isScraping ? (
          <Button
            onClick={() => {
              abortController.current = true
            }}
            variant="destructive"
            className="w-full h-10 shadow-sm rounded-lg flex items-center justify-center gap-2"
          >
            <Square className="w-4 h-4 fill-current" /> Stop & Close Worker
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            {/* RESTORED SAVE RECIPE BUTTON */}
            {(scrapedNodes.length > 0 || deepNodes.length > 0) && (
              <div className="flex justify-end mb-1">
                <button
                  onClick={handleSaveRecipe}
                  className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 uppercase tracking-wider font-semibold transition-colors"
                >
                  <Save className="w-3 h-3" /> Save as Recipe
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
