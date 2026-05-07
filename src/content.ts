// src/content.ts

const style = document.createElement("style")
style.textContent = `
  .web-scrapy-hover {
    outline: 2px solid #5e6ad2 !important; 
    outline-offset: -2px !important;
    cursor: crosshair !important;
    background-color: rgba(94, 106, 210, 0.1) !important;
    transition: all 0.1s ease;
  }
  .web-scrapy-selected {
    outline: 2px dashed #10b981 !important; 
    outline-offset: -2px !important;
    background-color: rgba(16, 185, 129, 0.1) !important;
  }
  .web-scrapy-pagination-selected {
    outline: 2px dashed #d946ef !important; 
    outline-offset: -2px !important;
    background-color: rgba(217, 70, 239, 0.1) !important;
  }
  .web-scrapy-container-selected {
    outline: 2px dashed #f59e0b !important; /* Amber for containers */
    outline-offset: -2px !important;
    background-color: rgba(245, 158, 11, 0.1) !important;
  }
  #web-scrapy-glass-shield {
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    z-index: 2147483647; cursor: not-allowed;
    background: transparent;
  }
`
document.head.appendChild(style)

let isSelecting = false
let currentSelectionMode: "column" | "pagination" | "container" = "column"
let hoveredElement: HTMLElement | null = null
let selectedElements: HTMLElement[] = []
let paginationElement: HTMLElement | null = null
let containerElements: HTMLElement[] = []

const generateSelector = (el: HTMLElement): string => {
  if (el.id) return `#${el.id}`
  let selector = el.tagName.toLowerCase()
  if (el.className && typeof el.className === "string") {
    const classes = el.className
      .split(" ")
      .filter((c) => c.trim() !== "" && !c.includes("web-scrapy"))
      .join(".")
    if (classes) selector += `.${classes}`
  }
  return selector
}

const extractAvailableAttributes = (el: HTMLElement) => {
  const attrs: { name: string; preview: string }[] = []
  attrs.push({
    name: "text",
    preview: el.innerText.trim().slice(0, 80) || "<empty>",
  })
  if (el instanceof HTMLAnchorElement && el.href)
    attrs.push({ name: "href", preview: el.href.slice(0, 80) })
  if (el instanceof HTMLImageElement && el.src)
    attrs.push({ name: "src", preview: el.src.slice(0, 80) })
  Array.from(el.attributes).forEach((attr) => {
    const name = attr.name.toLowerCase()
    if (!["class", "style", "href", "src"].includes(name)) {
      attrs.push({ name, preview: attr.value.slice(0, 80) })
    }
  })
  return attrs
}

const handleMouseMove = (e: MouseEvent) => {
  if (!isSelecting) return
  const target = e.target as HTMLElement
  if (target === hoveredElement) return
  if (hoveredElement) hoveredElement.classList.remove("web-scrapy-hover")
  if (
    target &&
    target !== document.body &&
    target !== document.documentElement
  ) {
    target.classList.add("web-scrapy-hover")
    hoveredElement = target
  }
}

const stopSelection = () => {
  isSelecting = false
  document.removeEventListener("mousemove", handleMouseMove, true)
  document.removeEventListener("click", handleClick, true)
  if (hoveredElement) {
    hoveredElement.classList.remove("web-scrapy-hover")
    hoveredElement = null
  }
}

const startSelection = (mode: "column" | "pagination" | "container") => {
  isSelecting = true
  currentSelectionMode = mode
  document.addEventListener("mousemove", handleMouseMove, true)
  document.addEventListener("click", handleClick, true)
}

const handleClick = (e: MouseEvent) => {
  if (!isSelecting) return
  e.preventDefault()
  e.stopPropagation()

  if (hoveredElement) {
    const selector = generateSelector(hoveredElement)

    if (currentSelectionMode === "column") {
      const matches = Array.from(
        document.querySelectorAll(selector),
      ) as HTMLElement[]
      matches.forEach((el) => el.classList.add("web-scrapy-selected"))
      selectedElements.push(...matches)
      const attributesList = extractAvailableAttributes(matches[0])
      chrome.runtime.sendMessage({
        action: "ELEMENTS_SELECTED",
        payload: {
          selector,
          count: matches.length,
          attributes: attributesList,
        },
      })
    } else if (currentSelectionMode === "container") {
      containerElements.forEach((el) =>
        el.classList.remove("web-scrapy-container-selected"),
      )
      const matches = Array.from(
        document.querySelectorAll(selector),
      ) as HTMLElement[]
      matches.forEach((el) => el.classList.add("web-scrapy-container-selected"))
      containerElements = matches
      chrome.runtime.sendMessage({
        action: "CONTAINER_SELECTED",
        payload: { selector, count: matches.length },
      })
    } else if (currentSelectionMode === "pagination") {
      if (paginationElement)
        paginationElement.classList.remove("web-scrapy-pagination-selected")
      hoveredElement.classList.add("web-scrapy-pagination-selected")
      paginationElement = hoveredElement
      chrome.runtime.sendMessage({
        action: "PAGINATION_SELECTED",
        payload: { selector },
      })
    }
    stopSelection()
  }
}

const clearHighlights = () => {
  if (hoveredElement) hoveredElement.classList.remove("web-scrapy-hover")
  selectedElements.forEach((el) => el.classList.remove("web-scrapy-selected"))
  containerElements.forEach((el) =>
    el.classList.remove("web-scrapy-container-selected"),
  )
  if (paginationElement)
    paginationElement.classList.remove("web-scrapy-pagination-selected")
  selectedElements = []
  containerElements = []
  hoveredElement = null
  paginationElement = null
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "TOGGLE_SELECTION") {
    const mode = request.mode || "column"
    if (isSelecting && currentSelectionMode === mode) stopSelection()
    else {
      if (isSelecting) stopSelection()
      startSelection(mode)
    }
    sendResponse({ status: "success", isSelecting, mode: currentSelectionMode })
  }

  if (request.action === "CLEAR_SELECTION") {
    clearHighlights()
    sendResponse({ status: "success" })
  }

  if (request.action === "BLOCK_UI") {
    if (!document.getElementById("web-scrapy-glass-shield")) {
      const shield = document.createElement("div")
      shield.id = "web-scrapy-glass-shield"
      shield.innerHTML = `<div style="position:absolute; bottom:20px; right:20px; background:#18181b; color:#fff; padding:8px 16px; border-radius:6px; font-family:sans-serif; font-size:12px; border:1px solid #3f3f46; box-shadow:0 4px 6px rgba(0,0,0,0.3);">Scraping active...</div>`
      document.body.appendChild(shield)
    }
    sendResponse({ status: "success" })
  }

  if (request.action === "UNBLOCK_UI") {
    const shield = document.getElementById("web-scrapy-glass-shield")
    if (shield) shield.remove()
    sendResponse({ status: "success" })
  }

  if (request.action === "SCROLL_PAGE") {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })
    setTimeout(() => sendResponse({ status: "success" }), 1500)
    return true
  }

  if (request.action === "EXECUTE_SCRAPE") {
    try {
      const schema = request.payload.schema
      const containerSelector = request.payload.containerSelector
      const scrapedData: any[] = []

      // BULLETPROOF MODE: Scoped by Row Container
      if (containerSelector) {
        const containers = Array.from(
          document.querySelectorAll(containerSelector),
        )

        containers.forEach((container) => {
          const rowObj: Record<string, string> = {}

          schema.forEach((col: any) => {
            // Find the element INSIDE the current container
            const el = container.querySelector(col.selector) as HTMLElement
            let val = ""

            if (el) {
              if (col.attribute === "text") val = el.innerText.trim()
              else if (col.attribute === "href")
                val = (el as HTMLAnchorElement).href || ""
              else if (col.attribute === "src")
                val = (el as HTMLImageElement).src || ""
              else val = el.getAttribute(col.attribute) || ""
            }
            rowObj[col.columnName] = val
          })

          scrapedData.push(rowObj)
        })
      }
      // LEGACY MODE: Array Zipping (Fallback if no container selected)
      else {
        let maxRows = 0
        const columnData = schema.map((col: any) => {
          const elements = Array.from(document.querySelectorAll(col.selector))
          maxRows = Math.max(maxRows, elements.length)
          return { ...col, elements }
        })

        for (let i = 0; i < maxRows; i++) {
          const rowObj: Record<string, string> = {}
          columnData.forEach((col: any) => {
            const el = col.elements[i] as HTMLElement
            let val = ""
            if (el) {
              if (col.attribute === "text") val = el.innerText.trim()
              else if (col.attribute === "href")
                val = (el as HTMLAnchorElement).href || ""
              else if (col.attribute === "src")
                val = (el as HTMLImageElement).src || ""
              else val = el.getAttribute(col.attribute) || ""
            }
            rowObj[col.columnName] = val
          })
          scrapedData.push(rowObj)
        }
      }

      sendResponse({ status: "success", data: scrapedData })
    } catch (error) {
      sendResponse({ status: "error", message: String(error) })
    }
  }

  if (request.action === "CLICK_NEXT") {
    const nextBtn = document.querySelector(request.payload.selector) as
      | HTMLElement
      | HTMLButtonElement
    if (nextBtn) {
      const isDisabled =
        (nextBtn as HTMLButtonElement).disabled ||
        nextBtn.classList.contains("disabled") ||
        nextBtn.getAttribute("aria-disabled") === "true"
      if (isDisabled)
        sendResponse({ status: "error", message: "Next button disabled" })
      else {
        nextBtn.click()
        sendResponse({ status: "success" })
      }
    } else {
      sendResponse({ status: "error", message: "Not found" })
    }
  }

  return true
})
