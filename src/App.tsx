import {
  AlertCircle,
  ArrowRightToLine,
  Bookmark,
  BoxSelect,
  Check,
  Columns3,
  MousePointer2,
  Play,
  Rows4,
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
}

interface Recipe {
  id: string
  domain: string
  name: string
  schema: ScrapedNode[]
  container: string | null
  pagination: string | null
}

interface RecoveryState {
  domain: string
  url: string
  schema: ScrapedNode[]
  container: string | null
  pagination: string | null
  allData: any[]
  currentPage: number
}

const randomSleep = (min: number, max: number) => {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min
  return new Promise((resolve) => setTimeout(resolve, delay))
}

function App() {
  // FORCE DARK MODE
  useEffect(() => {
    document.documentElement.classList.add("dark")
  }, [])

  const [isSelecting, setIsSelecting] = useState(false)
  const [selectionMode, setSelectionMode] = useState<
    "column" | "pagination" | "container"
  >("column")
  const [isScraping, setIsScraping] = useState(false)

  // Core Data Schema
  const [scrapedNodes, setScrapedNodes] = useState<ScrapedNode[]>([])
  const [containerSelector, setContainerSelector] = useState<string | null>(
    null,
  )
  const [containerCount, setContainerCount] = useState<number>(0)
  const [paginationSelector, setPaginationSelector] = useState<string | null>(
    null,
  )

  // Settings
  const [pageLimitMode, setPageLimitMode] = useState<"custom" | "all">("custom")
  const [maxPages, setMaxPages] = useState<number>(3)
  const [exportFormat, setExportFormat] = useState<"csv" | "json">("json")
  const [statusText, setStatusText] = useState("")

  // Feature State: Persistence & Automation
  const [activeDomain, setActiveDomain] = useState<string>("")
  const [recipes, setRecipes] = useState<Record<string, Recipe[]>>({})
  const [suggestedRecipe, setSuggestedRecipe] = useState<Recipe | null>(null)
  const [showRecipeManager, setShowRecipeManager] = useState(false)
  const [recoveryData, setRecoveryData] = useState<RecoveryState | null>(null)

  const abortController = useRef(false)

  // Initialization: Check Storage & Active Tab
  useEffect(() => {
    const init = async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      })
      if (tab?.url) {
        try {
          const urlObj = new URL(tab.url)
          const domain = urlObj.hostname.replace("www.", "")
          setActiveDomain(domain)

          // Fetch Recipes & Recovery State
          chrome.storage.local.get(
            ["scrapy_recipes", "scrapy_recovery"],
            (result) => {
              if (result.scrapy_recipes) {
                setRecipes(result.scrapy_recipes)
                // Check if we have a recipe for this domain
                if (
                  result.scrapy_recipes[domain] &&
                  result.scrapy_recipes[domain].length > 0
                ) {
                  setSuggestedRecipe(result.scrapy_recipes[domain][0]) // Suggest the first match
                }
              }
              if (result.scrapy_recovery) {
                setRecoveryData(result.scrapy_recovery)
              }
            },
          )
        } catch (e) {
          console.error("Invalid tab URL")
        }
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
          columnName: `Column ${scrapedNodes.length + 1}`,
          attribute: "text",
          availableAttributes: message.payload.attributes,
        }
        setScrapedNodes((prev) => [...prev, newNode])
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
  }, [scrapedNodes.length])

  // --- Recipe Management ---
  const handleSaveRecipe = () => {
    const recipeName = prompt(
      "Enter a name for this recipe template:",
      `${activeDomain} default`,
    )
    if (!recipeName) return

    const newRecipe: Recipe = {
      id: crypto.randomUUID(),
      domain: activeDomain,
      name: recipeName,
      schema: scrapedNodes,
      container: containerSelector,
      pagination: paginationSelector,
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

  // --- Core Scraper Engine ---
  const toggleScraper = async (mode: "column" | "pagination" | "container") => {
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

  const clearSelection = async () => {
    setScrapedNodes([])
    setPaginationSelector(null)
    setContainerSelector(null)
    setContainerCount(0)
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      })
      if (tab?.id)
        chrome.tabs.sendMessage(tab.id, { action: "CLEAR_SELECTION" })
    } catch (error) {
      console.error(error)
    }
  }

  const convertToCSV = (objArray: any[]) => {
    if (objArray.length === 0) return ""
    const headers = Object.keys(objArray[0])
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

  const handleScrapeAndDownload = async (isResume = false) => {
    abortController.current = false
    setIsScraping(true)
    setSuggestedRecipe(null) // Hide banners when running

    let allData: any[] = []
    let currentPage = 1
    const keepScraping = true

    // Handle Resume Setup
    if (isResume && recoveryData) {
      allData = recoveryData.allData
      currentPage = recoveryData.currentPage
      // Visually restore UI setup
      setScrapedNodes(recoveryData.schema)
      setContainerSelector(recoveryData.container)
      setPaginationSelector(recoveryData.pagination)
      setRecoveryData(null) // Clear prompt
    }

    try {
      const [initTab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      })
      if (initTab?.id)
        chrome.tabs.sendMessage(initTab.id, { action: "BLOCK_UI" })

      while (keepScraping) {
        if (abortController.current) {
          setStatusText("Scraping aborted by user.")
          break
        }

        const [tab] = await chrome.tabs.query({
          active: true,
          lastFocusedWindow: true,
        })
        if (!tab?.id) break

        setStatusText(`Scrolling page ${currentPage}...`)
        await new Promise((resolve) =>
          chrome.tabs.sendMessage(tab.id!, { action: "SCROLL_PAGE" }, resolve),
        )

        setStatusText(`Extracting data from page ${currentPage}...`)
        const scrapeRes: any = await new Promise((resolve) => {
          chrome.tabs.sendMessage(
            tab.id!,
            {
              action: "EXECUTE_SCRAPE",
              payload: { schema: scrapedNodes, containerSelector },
            },
            resolve,
          )
        })

        if (scrapeRes?.status === "success" && scrapeRes.data) {
          allData = [...allData, ...scrapeRes.data]

          // AUTO-RESUME CHECKPOINT: Save state locally after every page
          await chrome.storage.local.set({
            scrapy_recovery: {
              domain: activeDomain,
              url: tab.url,
              schema: scrapedNodes,
              container: containerSelector,
              pagination: paginationSelector,
              allData: allData,
              currentPage: currentPage + 1, // Setup for the next loop if it crashes
            },
          })
        } else {
          break
        }

        if (abortController.current) break

        if (paginationSelector) {
          if (pageLimitMode === "custom" && currentPage >= maxPages) break

          setStatusText(`Clicking next page...`)
          const clickRes: any = await new Promise((resolve) => {
            chrome.tabs.sendMessage(
              tab.id!,
              {
                action: "CLICK_NEXT",
                payload: { selector: paginationSelector },
              },
              resolve,
            )
          })

          if (clickRes?.status !== "success") break

          setStatusText(`Simulating human delay...`)
          await randomSleep(3000, 5000)
          currentPage++

          chrome.tabs.sendMessage(tab.id!, { action: "BLOCK_UI" })
        } else {
          break
        }
      }

      // GRACEFUL FINISH: Clear recovery data
      chrome.storage.local.remove(["scrapy_recovery"])
      setRecoveryData(null)

      setStatusText(`Generating ${exportFormat.toUpperCase()}...`)
      const [finalTab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      })
      if (finalTab?.id)
        chrome.tabs.sendMessage(finalTab.id, { action: "UNBLOCK_UI" })

      if (allData.length > 0) {
        let blob: Blob
        let filename: string
        if (exportFormat === "csv") {
          const csvData = convertToCSV(allData)
          blob = new Blob([csvData], { type: "text/csv;charset=utf-8;" })
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
      setIsScraping(false)
      setStatusText("")
      abortController.current = false
    }
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-sans selection:bg-primary/20">
      {/* Recipe Manager Overlay */}
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
                        Load Template
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border/40 shrink-0 bg-background/95 backdrop-blur z-10">
        <div className="flex items-center gap-2 text-primary">
          <BoxSelect className="w-4 h-4" />
          <span className="text-sm font-medium tracking-tight">Web Scrapy</span>
        </div>
        {!isScraping && (
          <div className="flex items-center gap-1">
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
            {scrapedNodes.length > 0 && (
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

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        {/* CRITICAL BANNER: Auto-Resume */}
        {recoveryData && !isScraping && (
          <div className="p-3.5 bg-amber-950/30 border border-amber-900/50 rounded-lg flex flex-col gap-3 shrink-0 animate-in slide-in-from-top-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-xs font-semibold text-amber-500">
                  Unfinished Scrape Detected
                </h3>
                <p className="text-[10px] text-amber-500/80 mt-1 leading-tight">
                  Found{" "}
                  <strong className="text-amber-400">
                    {recoveryData.allData.length} items
                  </strong>{" "}
                  from <span className="font-mono">{recoveryData.domain}</span>.
                  It stopped at Page {recoveryData.currentPage - 1}.
                </p>
              </div>
            </div>
            {activeDomain === recoveryData.domain ? (
              <div className="flex gap-2">
                <Button
                  onClick={() => setRecoveryData(null)}
                  variant="ghost"
                  className="flex-1 h-7 text-xs text-amber-500/70 hover:text-amber-400 hover:bg-amber-950/50 border border-amber-900/30"
                >
                  Discard Data
                </Button>
                <Button
                  onClick={() => handleScrapeAndDownload(true)}
                  className="flex-1 h-7 text-xs bg-amber-600 hover:bg-amber-500 text-white border-none"
                >
                  Resume from Pg {recoveryData.currentPage}
                </Button>
              </div>
            ) : (
              <p className="text-[10px] text-amber-400/80 bg-amber-950/50 p-2 rounded text-center border border-amber-900/30">
                Navigate to{" "}
                <strong className="text-amber-400 font-mono">
                  {recoveryData.domain}
                </strong>{" "}
                to resume this session.
              </p>
            )}
          </div>
        )}

        {/* HELPFUL BANNER: Suggested Recipe */}
        {suggestedRecipe && !isScraping && !recoveryData && (
          <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg flex items-center justify-between shrink-0 animate-in fade-in">
            <div className="flex items-center gap-2 text-primary">
              <Bookmark className="w-4 h-4" />
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

        {/* Step 1: Container Setup */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Rows4 className="w-3.5 h-3.5" />
            <h2 className="text-xs font-semibold uppercase tracking-wider">
              1. Row Context
            </h2>
          </div>
          <div className="group relative">
            <Button
              onClick={() => toggleScraper("container")}
              disabled={isScraping}
              variant="outline"
              className={`w-full justify-start h-auto py-3 px-4 border-dashed transition-all ${isSelecting && selectionMode === "container" ? "border-primary text-primary bg-primary/5" : containerSelector ? "border-border/50 border-solid bg-secondary/20" : "border-border/60 hover:border-border hover:bg-secondary/30 text-muted-foreground"}`}
            >
              <div className="flex items-center gap-3 w-full">
                {isSelecting && selectionMode === "container" ? (
                  <MousePointer2 className="w-4 h-4 animate-pulse" />
                ) : containerSelector ? (
                  <Check className="w-4 h-4 text-primary" />
                ) : (
                  <MousePointer2 className="w-4 h-4" />
                )}
                <div className="flex flex-col items-start text-left flex-1">
                  <span className="text-sm font-medium">
                    {isSelecting && selectionMode === "container"
                      ? "Select element on page..."
                      : containerSelector
                        ? "Row Container Selected"
                        : "Define Row Container"}
                  </span>
                  {containerSelector && (
                    <span className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate max-w-[200px]">
                      {containerCount} matching rows found
                    </span>
                  )}
                </div>
              </div>
            </Button>
          </div>
        </section>

        {/* Step 2: Data Columns */}
        <section className="space-y-3">
          <div className="flex items-center justify-between text-muted-foreground">
            <div className="flex items-center gap-2">
              <Columns3 className="w-3.5 h-3.5" />
              <h2 className="text-xs font-semibold uppercase tracking-wider">
                2. Data Extractors
              </h2>
            </div>
            <Button
              onClick={() => toggleScraper("column")}
              disabled={
                isScraping || (isSelecting && selectionMode !== "column")
              }
              variant="ghost"
              size="sm"
              className={`h-7 text-xs transition-colors ${isSelecting && selectionMode === "column" ? "text-primary bg-primary/10" : ""}`}
            >
              {isSelecting && selectionMode === "column"
                ? "Cancel"
                : "+ Add Column"}
            </Button>
          </div>

          <div className="space-y-3">
            {scrapedNodes.length === 0 && !isSelecting && (
              <div className="text-center py-6 border border-dashed border-border/40 rounded-lg text-muted-foreground text-xs">
                No columns defined.
              </div>
            )}

            {scrapedNodes.map((node) => {
              const activePreview =
                node.availableAttributes.find((a) => a.name === node.attribute)
                  ?.preview || "No data."
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
                          setScrapedNodes((prev) =>
                            prev.map((n) =>
                              n.id === node.id
                                ? { ...n, columnName: e.target.value }
                                : n,
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
                        setScrapedNodes((prev) =>
                          prev.filter((n) => n.id !== node.id),
                        )
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
                        setScrapedNodes((prev) =>
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
                  <div className="bg-black/20 rounded-md p-2 border border-border/20">
                    <p
                      className="text-[10px] text-muted-foreground font-mono truncate"
                      title={activePreview}
                    >
                      {activePreview}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Step 3: Automation/Pagination */}
        <section className="space-y-3">
          <div className="flex items-center justify-between text-muted-foreground">
            <div className="flex items-center gap-2">
              <ArrowRightToLine className="w-3.5 h-3.5" />
              <h2 className="text-xs font-semibold uppercase tracking-wider">
                3. Pagination
              </h2>
            </div>
            <Button
              onClick={() => toggleScraper("pagination")}
              disabled={
                isScraping || (isSelecting && selectionMode !== "pagination")
              }
              variant="ghost"
              size="sm"
              className={`h-7 text-xs transition-colors ${isSelecting && selectionMode === "pagination" ? "text-primary bg-primary/10" : ""}`}
            >
              {isSelecting && selectionMode === "pagination"
                ? "Cancel"
                : paginationSelector
                  ? "Change Button"
                  : "+ Set Next Button"}
            </Button>
          </div>
          {paginationSelector && (
            <div className="p-3.5 bg-secondary/10 border border-border/30 rounded-xl space-y-3 overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Scrape Range</span>
                <Select
                  disabled={isScraping}
                  value={pageLimitMode}
                  onValueChange={(val: "all" | "custom") =>
                    setPageLimitMode(val)
                  }
                >
                  <SelectTrigger className="w-[110px] h-7 text-xs bg-background border-border/50 rounded-md shadow-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border">
                    <SelectItem value="custom" className="text-xs">
                      Set Limit
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
                    Max Pages
                  </span>
                  <Input
                    disabled={isScraping}
                    type="number"
                    value={maxPages}
                    onChange={(e) => setMaxPages(Number(e.target.value))}
                    className="w-16 h-7 text-xs bg-background border-border/50 rounded-md shadow-sm text-center px-1"
                    min={1}
                  />
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      {/* Execution Footer */}
      <footer className="px-4 py-4 border-t border-border/40 shrink-0 bg-background/95 backdrop-blur z-10 space-y-3">
        {statusText && (
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground text-center font-medium">
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
            <Square className="w-4 h-4 fill-current" /> Stop & Save
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            {scrapedNodes.length > 0 && (
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
                onClick={() => handleScrapeAndDownload(false)}
                className="flex-1 h-10 rounded-lg shadow-sm font-medium flex items-center justify-center gap-2"
              >
                <Play className="w-3.5 h-3.5 fill-current" /> Run Extraction
              </Button>
            </div>
          </div>
        )}
      </footer>
    </div>
  )
}

export default App
