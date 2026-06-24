import { GoogleGenAI } from "@google/genai";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PROMPT = `You are a Disney Lorcana TCG card identifier. Analyze this card image and extract ALL visible information:
- name: The character/card name (e.g. "Elsa")
- subtitle: The card subtitle below the name (e.g. "Snow Queen")
- color: The ink color (Amber, Amethyst, Emerald, Ruby, Sapphire, or Steel)
- inkCost: The number in the top-left circle (ink cost)
- strength: The number in the bottom-left (attack/strength)
- willpower: The number in the bottom-right (defense/willpower)
- cardNumber: The card number at the bottom (e.g. "42/204")

Respond ONLY with valid JSON in this exact format, no other text:
{"name": "...", "subtitle": "...", "color": "...", "inkCost": 0, "strength": 0, "willpower": 0, "cardNumber": "..."}

Use 0 for numeric fields you cannot read. Use empty string for text fields you cannot identify.`;

export interface RecognizedCard {
  name: string;
  subtitle: string;
  color: string;
  inkCost: number;
  strength: number;
  willpower: number;
  cardNumber: string;
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

  try {
    const candidates = await prisma.card.findMany({
      where: {
        name: { contains: recognized.name, mode: "insensitive" },
      },
      take: 50,
    });

    if (candidates.length === 0) {
      return { recognized, matches: [], error: "No cards found matching that name" };
    }

    const scored = candidates.map((card) => {
      let score = 0;

      if (recognized.subtitle) {
        const subLower = recognized.subtitle.toLowerCase();
        const cardSubLower = card.subtitle.toLowerCase();
        if (cardSubLower === subLower) score += 10;
        else if (cardSubLower.includes(subLower) || subLower.includes(cardSubLower)) score += 5;
      }

      if (recognized.color && card.color.toLowerCase() === recognized.color.toLowerCase()) {
        score += 4;
      }

      if (recognized.inkCost > 0 && card.inkCost === recognized.inkCost) {
        score += 3;
      }

      if (recognized.strength > 0 && card.strength === recognized.strength) {
        score += 2;
      }

      if (recognized.willpower > 0 && card.willpower === recognized.willpower) {
        score += 2;
      }

      if (recognized.cardNumber) {
        const numMatch = recognized.cardNumber.match(/^(\d+)/);
        if (numMatch) {
          const cardNumMatch = card.cardNumber.match(/^(\d+)/);
          if (cardNumMatch && cardNumMatch[1] === numMatch[1]) {
            score += 6;
          }
        }
      }

      return { card, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const matches = scored.slice(0, 10).map((s) => s.card);

    return { recognized, matches };
  } catch (err) {
    console.error("DB search error:", err);
    return { recognized, matches: [], error: "Database search failed" };
  }
}
