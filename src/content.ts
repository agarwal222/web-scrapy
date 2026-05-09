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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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

// Automatically detect robust attribute selectors for elements like emails or phones
const detectSmartSelector = (el: HTMLElement): string | undefined => {
  if (el instanceof HTMLAnchorElement) {
    if (el.href.startsWith("mailto:")) return `a[href^="mailto:"]`
    if (el.href.startsWith("tel:")) return `a[href^="tel:"]`
    if (el.href.includes("linkedin.com")) return `a[href*="linkedin.com"]`
    if (el.href.includes("twitter.com") || el.href.includes("x.com"))
      return `a[href*="twitter.com"], a[href*="x.com"]`
    if (el.href.includes("facebook.com")) return `a[href*="facebook.com"]`
    if (el.href.includes("instagram.com")) return `a[href*="instagram.com"]`
  }
  return undefined
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
      const patternSelector = generateSelector(hoveredElement)
      const exactSelector = getExactSelector(hoveredElement)
      const smartSelector = detectSmartSelector(hoveredElement)

      let patternMatches = 0
      let exactMatches = 0
      try {
        patternMatches = document.querySelectorAll(patternSelector).length
      } catch (e) {}
      try {
        exactMatches = document.querySelectorAll(exactSelector).length
      } catch (e) {}

      chrome.runtime.sendMessage({
        action: "ELEMENTS_SELECTED",
        payload: {
          patternSelector,
          exactSelector,
          smartSelector,
          patternCount: patternMatches,
          exactCount: exactMatches,
          attributes: extractAvailableAttributes(hoveredElement),
        },
      })
    } else {
      const selector = generateSelector(hoveredElement)
      if (currentSelectionMode === "clickAction") {
        chrome.runtime.sendMessage({
          action: "ACTION_SELECTED",
          payload: { selector },
        })
      } else if (currentSelectionMode === "container") {
        let count = 0
        try {
          count = document.querySelectorAll(selector).length
        } catch (e) {}
        chrome.runtime.sendMessage({
          action: "CONTAINER_SELECTED",
          payload: { selector, count },
        })
      } else if (currentSelectionMode === "pagination") {
        chrome.runtime.sendMessage({
          action: "PAGINATION_SELECTED",
          payload: { selector },
        })
      }
    }
    stopSelection()
  }
}

const clearAllHighlights = () => {
  document
    .querySelectorAll(".web-scrapy-selected")
    .forEach((el) => el.classList.remove("web-scrapy-selected"))
  document
    .querySelectorAll(".web-scrapy-action-selected")
    .forEach((el) => el.classList.remove("web-scrapy-action-selected"))
  document
    .querySelectorAll(".web-scrapy-container-selected")
    .forEach((el) => el.classList.remove("web-scrapy-container-selected"))
  document
    .querySelectorAll(".web-scrapy-pagination-selected")
    .forEach((el) => el.classList.remove("web-scrapy-pagination-selected"))
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
    clearAllHighlights()
    sendResponse({ status: "success" })
  }

  if (request.action === "SYNC_HIGHLIGHTS") {
    clearAllHighlights()
    const { schema, containerSelector, paginationSelector } = request.payload

    try {
      if (containerSelector)
        document
          .querySelectorAll(containerSelector)
          .forEach((el) => el.classList.add("web-scrapy-container-selected"))
      if (paginationSelector) {
        const el = document.querySelector(paginationSelector)
        if (el) el.classList.add("web-scrapy-pagination-selected")
      }
      schema.forEach((col: any) => {
        // Find the active selector based on the targeting strategy
        let activeSel = col.selector
        if (col.targetingStrategy === "strict") activeSel = col.exactSelector
        if (col.targetingStrategy === "smart" && col.smartSelector)
          activeSel = col.smartSelector

        if (activeSel && col.targetingStrategy !== "label") {
          document
            .querySelectorAll(activeSel)
            .forEach((el) => el.classList.add("web-scrapy-selected"))
        }

        if (col.actions) {
          col.actions.forEach((act: any) => {
            if (act.selector)
              document
                .querySelectorAll(act.selector)
                .forEach((el) => el.classList.add("web-scrapy-action-selected"))
          })
        }
      })
    } catch (e) {
      console.warn("Invalid selector detected during sync.")
    }
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

  // --- CORE EXTRACTION ENGINE ---
  if (request.action === "EXECUTE_SCRAPE") {
    ;(async () => {
      try {
        const schema = request.payload.schema
        const containerSelector = request.payload.containerSelector
        const scrapedData: any[] = []

        // Helper to extract a single element's data based on column settings
        const extractElementValue = (
          el: HTMLElement | null,
          col: any,
        ): string => {
          let val = ""
          if (el) {
            if (col.attribute === "text") val = el.innerText.trim()
            else if (col.attribute === "href")
              val = (el as HTMLAnchorElement).href || ""
            else if (col.attribute === "src")
              val = (el as HTMLImageElement).src || ""
            else val = el.getAttribute(col.attribute) || ""
          }

          // Apply Post-Processing Regex Formatter
          if (val && col.regexPreset && col.regexPreset !== "none") {
            let match = null
            if (col.regexPreset === "email") {
              match = val.match(
                /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
              )
            } else if (col.regexPreset === "phone") {
              // Standard robust phone matcher
              match = val.match(
                /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/,
              )
            } else if (col.regexPreset === "url") {
              match = val.match(/https?:\/\/[^\s]+/)
            } else if (col.regexPreset === "linkedin") {
              match = val.match(/(https?:\/\/)?(www\.)?linkedin\.com\/[^\s]+/i)
            } else if (col.regexPreset === "custom" && col.customRegexPattern) {
              try {
                match = val.match(new RegExp(col.customRegexPattern, "i"))
              } catch (e) {
                console.error("Invalid custom regex", e)
              }
            }
            val = match ? match[0] : ""
          }
          return val
        }

        // Helper to locate an element relative to a parent container
        const locateElement = (
          container: ParentNode,
          col: any,
        ): HTMLElement | null => {
          if (col.targetingStrategy === "smart" && col.smartSelector) {
            return container.querySelector(col.smartSelector) as HTMLElement
          }
          if (col.targetingStrategy === "label" && col.anchorLabelText) {
            try {
              // Create an XPath to find the element containing the exact text inside this container
              const xpath = `descendant-or-self::*[contains(text(), '${col.anchorLabelText}')]`
              const result = document.evaluate(
                xpath,
                container,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null,
              )
              const labelNode = result.singleNodeValue as HTMLElement

              if (labelNode) {
                // Try grabbing the next sibling first
                if (labelNode.nextElementSibling) {
                  return labelNode.nextElementSibling as HTMLElement
                }
                // If it's isolated in a span/div, grab the parent's next sibling
                if (labelNode.parentElement?.nextElementSibling) {
                  return labelNode.parentElement
                    .nextElementSibling as HTMLElement
                }
                // Fallback: return the label node itself, hoping regex can parse the text out of it
                return labelNode
              }
            } catch (e) {
              console.warn("XPath label evaluation failed", e)
            }
            return null
          }
          // Default: Pattern or Strict Path
          const targetSel =
            col.targetingStrategy === "strict"
              ? col.exactSelector
              : col.patternSelector
          return container.querySelector(targetSel) as HTMLElement
        }

        // --- Container Mode Execution ---
        if (containerSelector) {
          const containers = Array.from(
            document.querySelectorAll(containerSelector),
          )
          for (const container of containers) {
            const rowObj: Record<string, string> = {}

            // Execute Pre-Scrape Actions
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

            // Extract Data
            for (const col of schema) {
              const el = locateElement(container, col)
              rowObj[col.columnName] = extractElementValue(el, col)
            }
            scrapedData.push(rowObj)
          }
        }

        // --- Full Page Mode Execution ---
        else {
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
            let elements: HTMLElement[] = []

            if (col.targetingStrategy === "smart" && col.smartSelector) {
              elements = Array.from(
                document.querySelectorAll(col.smartSelector),
              ) as HTMLElement[]
            } else if (
              col.targetingStrategy === "label" &&
              col.anchorLabelText
            ) {
              // Advanced Label finding across whole document
              const xpath = `//*[contains(text(), '${col.anchorLabelText}')]`
              const result = document.evaluate(
                xpath,
                document,
                null,
                XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
                null,
              )
              for (let i = 0; i < result.snapshotLength; i++) {
                const labelNode = result.snapshotItem(i) as HTMLElement
                if (labelNode.nextElementSibling)
                  elements.push(labelNode.nextElementSibling as HTMLElement)
                else if (labelNode.parentElement?.nextElementSibling)
                  elements.push(
                    labelNode.parentElement.nextElementSibling as HTMLElement,
                  )
                else elements.push(labelNode)
              }
            } else {
              const targetSel =
                col.targetingStrategy === "strict"
                  ? col.exactSelector
                  : col.patternSelector
              elements = Array.from(
                document.querySelectorAll(targetSel),
              ) as HTMLElement[]
            }

            maxRows = Math.max(maxRows, elements.length)
            return { ...col, elements }
          })

          for (let i = 0; i < maxRows; i++) {
            const rowObj: Record<string, string> = {}
            columnData.forEach((col: any) => {
              const el = col.elements[i] as HTMLElement | undefined
              rowObj[col.columnName] = extractElementValue(el || null, col)
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
