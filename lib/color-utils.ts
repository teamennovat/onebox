/**
 * Convert hex color to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  // Remove # if present
  hex = hex.replace(/^#/, '')
  
  // Parse hex color
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null
}

/**
 * Get label badge style with 20-30% opacity background and full color text
 * @param hexColor - Label color in hex format (e.g., "#FF0000")
 * @returns Object with backgroundColor and color CSS properties
 */
export function getLabelBadgeStyle(hexColor?: string): {
  backgroundColor: string
  color: string
} {
  if (!hexColor) {
    return {
      backgroundColor: 'rgb(219, 234, 254)', // bg-blue-100
      color: 'rgb(30, 58, 138)', // text-blue-800
    }
  }

  const rgb = hexToRgb(hexColor)
  if (!rgb) {
    // Fallback to blue if color parsing fails
    return {
      backgroundColor: 'rgb(219, 234, 254)',
      color: 'rgb(30, 58, 138)',
    }
  }

  // Calculate 25% opacity background (rgb with 0.25 alpha)
  const bgColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`
  
  // Full color for text
  const textColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`

  return {
    backgroundColor: bgColor,
    color: textColor,
  }
}

/**
 * Convert hex color to dark mode variant
 */
export function getLabelBadgeDarkStyle(hexColor?: string): {
  backgroundColor: string
  color: string
} {
  if (!hexColor) {
    return {
      backgroundColor: 'rgb(30, 58, 138)', // dark:bg-blue-900
      color: 'rgb(191, 219, 254)', // dark:text-blue-200
    }
  }

  const rgb = hexToRgb(hexColor)
  if (!rgb) {
    return {
      backgroundColor: 'rgb(30, 58, 138)',
      color: 'rgb(191, 219, 254)',
    }
  }

  // For dark mode, use darker version of the color for background and lighter for text
  // Darken by reducing RGB values
  const darkR = Math.max(0, rgb.r - 100)
  const darkG = Math.max(0, rgb.g - 100)
  const darkB = Math.max(0, rgb.b - 100)

  const bgColor = `rgba(${darkR}, ${darkG}, ${darkB}, 0.1)`
  const textColor = `rgb(${Math.min(255, rgb.r + 100)}, ${Math.min(255, rgb.g + 100)}, ${Math.min(255, rgb.b + 100)})`

  return {
    backgroundColor: bgColor,
    color: textColor,
  }
}
