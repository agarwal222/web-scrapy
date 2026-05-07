// src/content.ts

const style = document.createElement("style")
style.textContent = `
  .web-scrapy-hover { outline: 2px solid #5e6ad2 !important; outline-offset: -2px !important; cursor: crosshair !important; background-color: rgba(94, 106, 210, 0.1) !important; transition: all 0.1s ease; }
  .web-scrapy-selected { outline: 2px dashed #10b981 !important; outline-offset: -2px !important; background-color: rgba(16, 185, 129, 0.1) !important; }
  .web-scrapy-pagination-selected { outline: 2px dashed #d946ef !important; outline-offset: -2px !important; background-color: rgba(217, 70, 239, 0.1) !important; }
  .web-scrapy-container-selected { outline: 2px dashed #f59e0b !important; outline-offset: -2px !important; background-color: rgba(245, 158, 11, 0.1) !important; }
  .web-scrapy-action-selected { outline: 2px dashed #e11d48 !important; outline-offset: -2px !important; background-color: rgba(225, 29, 72, 0.1) !important; }
  #web-scrapy-glass-shield { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 2147483647; cursor: not-allowed; background: transparent; }
`
document.head.appendChild(style)

let isSelecting = false
let currentSelectionMode:
  | "column"
  | "pagination"
  | "container"
  | "clickAction" = "column"
let hoveredElement: HTMLElement | null = null
let selectedElements: HTMLElement[] = []
let paginationElement: HTMLElement | null = null
let containerElements: HTMLElement[] = []

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// 1. Broad Pattern Matcher (Good for lists)
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

// 2. Strict Exact Matcher (Good for unique profile elements)
const getExactSelector = (el: HTMLElement): string => {
  const path: string[] = []
  let current: HTMLElement | null = el

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let selector = current.tagName.toLowerCase()
    if (selector === "html") {
      path.unshift(selector)
      break
    }
    if (current.id) {
      selector += `#${current.id}`
      path.unshift(selector)
      break
    } else {
      let sibling = current.previousElementSibling
      let nth = 1
      while (sibling) {
        if (sibling.tagName.toLowerCase() === selector) nth++
        sibling = sibling.previousElementSibling
      }
      if (nth > 1 || current.nextElementSibling)
        selector += `:nth-of-type(${nth})`
    }
    path.unshift(selector)
    current = current.parentElement
  }
  return path.join(" > ")
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
    if (!["class", "style", "href", "src"].includes(name))
      attrs.push({ name, preview: attr.value.slice(0, 80) })
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

const startSelection = (
  mode: "column" | "pagination" | "container" | "clickAction",
) => {
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
    if (currentSelectionMode === "column") {
      // Calculate both selectors simultaneously
      const patternSelector = generateSelector(hoveredElement)
      const exactSelector = getExactSelector(hoveredElement)

      const patternMatches = document.querySelectorAll(patternSelector).length
      const exactMatches = document.querySelectorAll(exactSelector).length

      const matches = Array.from(
        document.querySelectorAll(patternSelector),
      ) as HTMLElement[]
      matches.forEach((el) => el.classList.add("web-scrapy-selected"))
      selectedElements.push(...matches)

      chrome.runtime.sendMessage({
        action: "ELEMENTS_SELECTED",
        payload: {
          patternSelector,
          exactSelector,
          patternCount: patternMatches,
          exactCount: exactMatches,
          attributes: extractAvailableAttributes(hoveredElement),
        },
      })
    } else {
      // Standard flow for actions, containers, pagination
      const selector = generateSelector(hoveredElement)
      if (currentSelectionMode === "clickAction") {
        hoveredElement.classList.add("web-scrapy-action-selected")
        selectedElements.push(hoveredElement)
        chrome.runtime.sendMessage({
          action: "ACTION_SELECTED",
          payload: { selector },
        })
      } else if (currentSelectionMode === "container") {
        containerElements.forEach((el) =>
          el.classList.remove("web-scrapy-container-selected"),
        )
        const matches = Array.from(
          document.querySelectorAll(selector),
        ) as HTMLElement[]
        matches.forEach((el) =>
          el.classList.add("web-scrapy-container-selected"),
        )
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
    }
    stopSelection()
  }
}

const clearHighlights = () => {
  if (hoveredElement) hoveredElement.classList.remove("web-scrapy-hover")
  selectedElements.forEach((el) => {
    el.classList.remove("web-scrapy-selected")
    el.classList.remove("web-scrapy-action-selected")
  })
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
    ;(async () => {
      try {
        const schema = request.payload.schema
        const containerSelector = request.payload.containerSelector
        const scrapedData: any[] = []

        if (containerSelector) {
          const containers = Array.from(
            document.querySelectorAll(containerSelector),
          )

          for (const container of containers) {
            const rowObj: Record<string, string> = {}

            for (const col of schema) {
              if (col.actions && col.actions.length > 0) {
                for (const action of col.actions) {
                  try {
                    if (action.type === "click" && action.selector) {
                      const btn = container.querySelector(
                        action.selector,
                      ) as HTMLElement
                      if (btn) btn.click()
                    } else if (action.type === "wait") {
                      await sleep(Number(action.value) || 500)
                    } else if (action.type === "type" && action.selector) {
                      const input = container.querySelector(
                        action.selector,
                      ) as HTMLInputElement
                      if (input) {
                        input.value = action.value || ""
                        input.dispatchEvent(
                          new Event("input", { bubbles: true }),
                        )
                        input.dispatchEvent(
                          new Event("change", { bubbles: true }),
                        )
                      }
                    }
                  } catch (e) {}
                }
              }
            }

            for (const col of schema) {
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
            }
            scrapedData.push(rowObj)
          }
        } else {
          for (const col of schema) {
            if (col.actions && col.actions.length > 0) {
              for (const action of col.actions) {
                try {
                  if (action.type === "click" && action.selector) {
                    const btns = Array.from(
                      document.querySelectorAll(action.selector),
                    ) as HTMLElement[]
                    btns.forEach((b) => b.click())
                  } else if (action.type === "wait") {
                    await sleep(Number(action.value) || 500)
                  } else if (action.type === "type" && action.selector) {
                    const inputs = Array.from(
                      document.querySelectorAll(action.selector),
                    ) as HTMLInputElement[]
                    inputs.forEach((i) => {
                      i.value = action.value || ""
                      i.dispatchEvent(new Event("input", { bubbles: true }))
                    })
                  }
                } catch (e) {}
              }
            }
          }

          if (schema.some((c: any) => c.actions && c.actions.length > 0))
            await sleep(800)

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
    })()
    return true
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
