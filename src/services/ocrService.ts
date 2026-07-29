export interface OCRService {
  isAvailable(): Promise<boolean>
  extractText(imagePath: string): Promise<string | undefined>
}

// Deliberately local-only. A native OCR implementation can be registered per platform later.
export const unavailableOcrService: OCRService = {
  async isAvailable() { return false },
  async extractText() { return undefined },
}
