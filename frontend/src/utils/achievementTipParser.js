/**
 * Parse raw achievement tip markdown into structured JSON
 * Expected format:
 * 
 * ## How to Unlock
 * 1. Step one
 * 2. Step two
 * 
 * ## Important Warnings
 * 1. Warning one
 * 2. Warning two
 * 
 * ## Time Estimate
 * 30-45 minutes
 * 
 * ## Pro Tips
 * 1. Tip one
 * 2. Tip two
 */

export function parseAchievementTip(tipMarkdown) {
  if (!tipMarkdown || typeof tipMarkdown !== 'string') {
    return null
  }

  const sections = {
    how_to_unlock: [],
    warnings: [],
    estimated_time: '',
    pro_tips: [],
  }

  // Split by section headers (case-insensitive, with optional ## markdown prefix)
  const lines = tipMarkdown.split('\n')
  let currentSection = null
  let currentContent = []

  for (const line of lines) {
    const trimmed = line.trim()

    // Detect section header (handles both "## How to Unlock" and "How to Unlock")
    if (/^#+\s*how to unlock$/i.test(trimmed) || /^how to unlock$/i.test(trimmed)) {
      if (currentSection && currentContent.length > 0) {
        saveSection(sections, currentSection, currentContent)
      }
      currentSection = 'how_to_unlock'
      currentContent = []
    } else if (/^#+\s*important warnings$/i.test(trimmed) || /^important warnings$/i.test(trimmed)) {
      if (currentSection && currentContent.length > 0) {
        saveSection(sections, currentSection, currentContent)
      }
      currentSection = 'warnings'
      currentContent = []
    } else if (/^#+\s*time estimate$/i.test(trimmed) || /^estimated time$/i.test(trimmed) || /^#+\s*estimated time$/i.test(trimmed)) {
      if (currentSection && currentContent.length > 0) {
        saveSection(sections, currentSection, currentContent)
      }
      currentSection = 'estimated_time'
      currentContent = []
    } else if (/^#+\s*pro tips$/i.test(trimmed) || /^pro tips$/i.test(trimmed)) {
      if (currentSection && currentContent.length > 0) {
        saveSection(sections, currentSection, currentContent)
      }
      currentSection = 'pro_tips'
      currentContent = []
    } else if (trimmed && currentSection) {
      // Skip empty lines between sections
      currentContent.push(trimmed)
    }
  }

  // Save last section
  if (currentSection && currentContent.length > 0) {
    saveSection(sections, currentSection, currentContent)
  }

  return sections
}

/**
 * Save current section content to the sections object
 */
function saveSection(sections, sectionKey, content) {
  const text = content.join('\n').trim() // Use newline instead of space to preserve markdown structure

  if (sectionKey === 'how_to_unlock' || sectionKey === 'pro_tips') {
    let items = extractNumberedItems(text)
    if (items.length === 0 && text) items = [text]
    sections[sectionKey] = items
  } else if (sectionKey === 'warnings') {
    let items = extractNumberedItems(text)
    if (items.length === 0 && text) {
      // If no numbered list is found, just use the entire text as a single item
      items = [text]
    }
    sections[sectionKey] = items
  } else if (sectionKey === 'estimated_time') {
    // Just store the text as-is
    sections[sectionKey] = text
  }
}

/**
 * Extract numbered list items (1. text, 2. text, etc.)
 * Handles both single-line "1. text 2. text" and multi-line formats
 */
function extractNumberedItems(text) {
  const items = []
  
  // Match all numbered items: "1. text", "2. text", etc.
  // An item marker is a number + "." or ")" with whitespace on both sides, so "Zone 2 key" or "1.5" never splits an item
  const regex = /(?:^|\s)(\d+)[.)]\s+([\s\S]+?)(?=\s+\d+[.)]\s|$)/g
  
  let match
  while ((match = regex.exec(text)) !== null) {
    const itemText = match[2].trim()
    if (itemText) {
      items.push(itemText)
    }
  }
  
  // If regex didn't find anything, try alternative parsing
  if (items.length === 0) {
    // Split by line and look for numbered items
    const lines = text.split(/\n/)
    let currentItem = ''

    for (const line of lines) {
      const numberMatch = line.match(/^\s*\d+[\.\)]\s+(.+)$/)
      if (numberMatch) {
        // This line starts a new numbered item
        if (currentItem) {
          items.push(currentItem.trim())
        }
        currentItem = numberMatch[1]
      } else if (currentItem && line.trim()) {
        // Continue the current item (multi-line)
        currentItem += ' ' + line.trim()
      }
    }

    // Don't forget the last item
    if (currentItem) {
      items.push(currentItem.trim())
    }
  }

  return items
}
