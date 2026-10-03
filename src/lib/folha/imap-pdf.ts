import pdfParse from 'pdf-parse/lib/pdf-parse.js'

export async function extractPdfText(
  content: Buffer,
  fileName: string,
): Promise<{ text: string; fileName: string }> {
  try {
    const parsed = await pdfParse(content)
    return { text: parsed.text ?? '', fileName }
  } catch {
    return { text: '', fileName }
  }
}
