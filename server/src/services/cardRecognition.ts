import { GoogleGenAI } from "@google/genai";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PROMPT = `You are a Disney Lorcana TCG card identifier. Analyze this card image and extract:
- name: The character/card name (e.g. "Elsa")
- subtitle: The card subtitle below the name (e.g. "Snow Queen")
- set: The set name if visible
- color: The ink color (Amber, Amethyst, Emerald, Ruby, Sapphire, or Steel)

Respond ONLY with valid JSON in this exact format, no other text:
{"name": "...", "subtitle": "...", "set": "...", "color": "..."}

If you cannot identify a field, use an empty string for that field.`;

export interface RecognizedCard {
  name: string;
  subtitle: string;
  set: string;
  color: string;
}

export interface RecognitionResult {
  recognized: RecognizedCard | null;
  matches: any[];
  error?: string;
}

export async function recognizeCard(
  imageDataUrl: string
): Promise<RecognitionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { recognized: null, matches: [], error: "Vision API key not configured" };
  }

  const ai = new GoogleGenAI({ apiKey });

  let base64Data = imageDataUrl;
  let mimeType = "image/jpeg";

  if (base64Data.startsWith("data:")) {
    const match = base64Data.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      mimeType = match[1];
      base64Data = match[2];
    }
  }

  let recognized: RecognizedCard;
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: PROMPT },
            { inlineData: { mimeType, data: base64Data } },
          ],
        },
      ],
    });

    const text = response.text?.trim() || "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { recognized: null, matches: [], error: "Could not parse AI response" };
    }

    recognized = JSON.parse(jsonMatch[0]);
  } catch (err: any) {
    console.error("Gemini vision error:", err?.message || err);
    return { recognized: null, matches: [], error: "Vision API request failed" };
  }

  if (!recognized.name) {
    return { recognized, matches: [], error: "Could not identify card name" };
  }

  const where: any = {
    OR: [
      { name: { contains: recognized.name, mode: "insensitive" } },
      { subtitle: { contains: recognized.name, mode: "insensitive" } },
    ],
  };

  try {
    let matches = await prisma.card.findMany({
      where,
      take: 10,
      orderBy: { name: "asc" },
    });

    if (recognized.subtitle && matches.length > 1) {
      const subtitleLower = recognized.subtitle.toLowerCase();
      const exact = matches.filter(
        (m) => m.subtitle.toLowerCase().includes(subtitleLower)
      );
      if (exact.length > 0) {
        const rest = matches.filter(
          (m) => !m.subtitle.toLowerCase().includes(subtitleLower)
        );
        matches = [...exact, ...rest];
      }
    }

    return { recognized, matches };
  } catch (err) {
    console.error("DB search error:", err);
    return { recognized, matches: [], error: "Database search failed" };
  }
}
