import {
  ArrowRightToLine,
  BoxSelect,
  Check,
  Columns3,
  MousePointer2,
  Play,
  Rows4,
  Square,
  Trash2,
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

const randomSleep = (min: number, max: number) => {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min
  return new Promise((resolve) => setTimeout(resolve, delay))
}

function App() {
  // FORCE DARK MODE PERMANENTLY
  useEffect(() => {
    document.documentElement.classList.add("dark")
  }, [])

  const [isSelecting, setIsSelecting] = useState(false)
  const [selectionMode, setSelectionMode] = useState<
    "column" | "pagination" | "container"
  >("column")
  const [isScraping, setIsScraping] = useState(false)
  const [scrapedNodes, setScrapedNodes] = useState<ScrapedNode[]>([])

  const [containerSelector, setContainerSelector] = useState<string | null>(
    null,
  )
  const [containerCount, setContainerCount] = useState<number>(0)

  const [paginationSelector, setPaginationSelector] = useState<string | null>(
    null,
  )
  const [pageLimitMode, setPageLimitMode] = useState<"custom" | "all">("custom")
  const [maxPages, setMaxPages] = useState<number>(3)

  const [exportFormat, setExportFormat] = useState<"csv" | "json">("json")
  const [statusText, setStatusText] = useState("")

  const abortController = useRef(false)

  useEffect(() => {
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
          if (chrome.runtime.lastError) {
            alert("Please refresh the webpage to inject the scraper script.")
            return
          }
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

  const handleScrapeAndDownload = async () => {
    abortController.current = false
    setIsScraping(true)
    let allData: any[] = []
    let currentPage = 1
    const keepScraping = true

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

          setStatusText(`Simulating delay...`)
          await randomSleep(3000, 5500)
          currentPage++

          chrome.tabs.sendMessage(tab.id!, { action: "BLOCK_UI" })
        } else {
          break
        }
      }

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
          const jsonData = JSON.stringify(allData, null, 2)
          blob = new Blob([jsonData], {
            type: "application/json;charset=utf-8;",
          })
          filename = `scrapy_export_${Date.now()}.json`
        }

        chrome.downloads.download({
          url: URL.createObjectURL(blob),
          filename: filename,
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
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border/40 shrink-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10">
        <div className="flex items-center gap-2 text-primary">
          <BoxSelect className="w-4 h-4" />
          <span className="text-sm font-medium tracking-tight">Web Scrapy</span>
        </div>
        {scrapedNodes.length > 0 && !isScraping && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSelection}
            className="h-7 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            Clear Data
          </Button>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-8 custom-scrollbar">
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
              className={`w-full justify-start h-auto py-3 px-4 border-dashed transition-all ${
                isSelecting && selectionMode === "container"
                  ? "border-primary text-primary bg-primary/5"
                  : containerSelector
                    ? "border-border/50 border-solid bg-secondary/20"
                    : "border-border/60 hover:border-border hover:bg-secondary/30 text-muted-foreground"
              }`}
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
                No columns defined. Click add column to start.
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
                            {attr.name === "text"
                              ? "Text (Inner Content)"
                              : attr.name}
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
            <Square className="w-4 h-4 fill-current" />
            Stop & Save
          </Button>
        ) : (
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
              onClick={handleScrapeAndDownload}
              className="flex-1 h-10 rounded-lg shadow-sm font-medium flex items-center justify-center gap-2"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Run Extraction
            </Button>
          </div>
        )}
      </footer>
    </div>
  )
}

export default App
