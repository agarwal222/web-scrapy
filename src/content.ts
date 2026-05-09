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

// ROBUST PAGINATION SELECTOR ENGINE
const getRobustPaginationSelectors = (clickedEl: HTMLElement): string[] => {
  const selectors: string[] = []

  // Climb the tree slightly in case the user clicked an inner <span> or <svg> inside the button
  let targetEl = clickedEl
  const interactiveParent = clickedEl.closest(
    'button, a, [role="button"]',
  ) as HTMLElement
  if (interactiveParent) targetEl = interactiveParent

  // 1. Semantic Attributes (Highest Reliability)
  const ariaLabel = targetEl.getAttribute("aria-label")
  if (ariaLabel && ariaLabel.toLowerCase().includes("next")) {
    selectors.push(
      `${targetEl.tagName.toLowerCase()}[aria-label="${ariaLabel}"]`,
    )
  }
  if (targetEl instanceof HTMLAnchorElement && targetEl.rel === "next") {
    selectors.push(`a[rel="next"]`)
  }

  // 2. Class names containing 'next'
  if (targetEl.className && typeof targetEl.className === "string") {
    const classes = targetEl.className.split(" ")
    const nextClass = classes.find((c) => c.toLowerCase().includes("next"))
    if (nextClass) selectors.push(`.${nextClass}`)
  }

  // 3. Text content (XPath generation)
  const textContent = targetEl.innerText.trim().toLowerCase()
  if (["next", "next page", ">", "→"].includes(textContent)) {
    // Prefix with xpath= so our executor knows how to handle it
    selectors.push(
      `xpath=//${targetEl.tagName.toLowerCase()}[normalize-space(text())='${targetEl.innerText.trim()}']`,
    )
  }

  // 4. Exact DOM Path (Brittle but acts as a solid fallback)
  selectors.push(getExactSelector(targetEl))

  // 5. Generic class/tag path
  selectors.push(generateSelector(targetEl))

  // Remove exact duplicates
  return Array.from(new Set(selectors))
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

      let patternMatches = 0,
        exactMatches = 0
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
    } else if (currentSelectionMode === "pagination") {
      // Use the new Robust Engine
      const selectors = getRobustPaginationSelectors(hoveredElement)
      chrome.runtime.sendMessage({
        action: "PAGINATION_SELECTED",
        payload: { selectors },
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
    const { schema, containerSelector, paginationSelectors } = request.payload

    try {
      if (containerSelector)
        document
          .querySelectorAll(containerSelector)
          .forEach((el) => el.classList.add("web-scrapy-container-selected"))

      // Highlight the first valid pagination selector found
      if (paginationSelectors && Array.isArray(paginationSelectors)) {
        for (const sel of paginationSelectors) {
          try {
            let el: HTMLElement | null = null
            if (sel.startsWith("xpath=")) {
              const result = document.evaluate(
                sel.replace("xpath=", ""),
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null,
              )
              el = result.singleNodeValue as HTMLElement
            } else {
              el = document.querySelector(sel)
            }
            if (el) {
              el.classList.add("web-scrapy-pagination-selected")
              break // Only highlight one
            }
          } catch (e) {}
        }
      }

      schema.forEach((col: any) => {
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

  if (request.action === "EXECUTE_SCRAPE") {
    ;(async () => {
      try {
        const schema = request.payload.schema
        const containerSelector = request.payload.containerSelector
        const scrapedData: any[] = []

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

          if (val && col.regexPreset && col.regexPreset !== "none") {
            let match = null
            if (col.regexPreset === "email")
              match = val.match(
                /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
              )
            else if (col.regexPreset === "phone")
              match = val.match(
                /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/,
              )
            else if (col.regexPreset === "url")
              match = val.match(/https?:\/\/[^\s]+/)
            else if (col.regexPreset === "linkedin")
              match = val.match(/(https?:\/\/)?(www\.)?linkedin\.com\/[^\s]+/i)
            else if (col.regexPreset === "custom" && col.customRegexPattern) {
              try {
                match = val.match(new RegExp(col.customRegexPattern, "i"))
              } catch (e) {}
            }
            val = match ? match[0] : ""
          }
          return val
        }

        const locateElement = (
          container: ParentNode,
          col: any,
        ): HTMLElement | null => {
          if (col.targetingStrategy === "smart" && col.smartSelector)
            return container.querySelector(col.smartSelector) as HTMLElement
          if (col.targetingStrategy === "label" && col.anchorLabelText) {
            try {
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
                if (labelNode.nextElementSibling)
                  return labelNode.nextElementSibling as HTMLElement
                if (labelNode.parentElement?.nextElementSibling)
                  return labelNode.parentElement
                    .nextElementSibling as HTMLElement
                return labelNode
              }
            } catch (e) {}
            return null
          }
          const targetSel =
            col.targetingStrategy === "strict"
              ? col.exactSelector
              : col.patternSelector
          return container.querySelector(targetSel) as HTMLElement
        }

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
              const el = locateElement(container, col)
              rowObj[col.columnName] = extractElementValue(el, col)
            }

            for (const col of schema) {
              if (!rowObj[col.columnName] && col.fallbackColumnId) {
                const fallbackCol = schema.find(
                  (c: any) => c.id === col.fallbackColumnId,
                )
                if (fallbackCol && rowObj[fallbackCol.columnName])
                  rowObj[col.columnName] = rowObj[fallbackCol.columnName]
              }
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
            let elements: HTMLElement[] = []

            if (col.targetingStrategy === "smart" && col.smartSelector) {
              elements = Array.from(
                document.querySelectorAll(col.smartSelector),
              ) as HTMLElement[]
            } else if (
              col.targetingStrategy === "label" &&
              col.anchorLabelText
            ) {
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

            columnData.forEach((col: any) => {
              if (!rowObj[col.columnName] && col.fallbackColumnId) {
                const fallbackCol = columnData.find(
                  (c: any) => c.id === col.fallbackColumnId,
                )
                if (fallbackCol && rowObj[fallbackCol.columnName])
                  rowObj[col.columnName] = rowObj[fallbackCol.columnName]
              }
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

  // UPDATED: MULTI-STRATEGY EXECUTION
  if (request.action === "CLICK_NEXT") {
    const selectors = request.payload.selectors as string[]
    let targetBtn: HTMLElement | null = null

    if (!selectors || selectors.length === 0) {
      sendResponse({ status: "error", message: "No selectors provided" })
      return true
    }

    // Try each strategy in order until we find a button on the screen
    for (const sel of selectors) {
      try {
        if (sel.startsWith("xpath=")) {
          const x = sel.replace("xpath=", "")
          const result = document.evaluate(
            x,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null,
          )
          if (result.singleNodeValue) {
            targetBtn = result.singleNodeValue as HTMLElement
            break
          }
        } else {
          const el = document.querySelector(sel) as HTMLElement
          if (el) {
            targetBtn = el
            break
          }
        }
      } catch (e) {
        console.warn("Strategy failed:", sel)
      }
    }

    if (targetBtn) {
      // Robust check for standard disablement
      const isDisabled =
        (targetBtn as HTMLButtonElement).disabled ||
        targetBtn.classList.contains("disabled") ||
        targetBtn.getAttribute("aria-disabled") === "true" ||
        targetBtn.parentElement?.classList.contains("disabled")

      if (isDisabled) {
        sendResponse({
          status: "error",
          message: "Next button is present but disabled",
        })
      } else {
        targetBtn.click()
        sendResponse({ status: "success" })
      }
    } else {
      sendResponse({
        status: "error",
        message: "Next button not found using any strategy",
      })
    }
  }
  return true
})
