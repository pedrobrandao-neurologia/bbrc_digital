import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.API_KEY || ''; // Ensure configured in environment
export const isGeminiConfigured = Boolean(apiKey);
const ai = new GoogleGenAI({ apiKey });

export async function analyzeClockDrawing(imageBase64: string): Promise<number> {
  if (!apiKey) {
    console.warn("Gemini API Key missing. Returning mock score.");
    return 3; // Mock return for development if key missing
  }

  try {
    const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpg|jpeg);base64,/, "");

    const prompt = `
      Você é um neuropsicólogo especialista. Analise este desenho do Teste do Desenho do Relógio (TDR).
      Instrução dada ao paciente: "Desenhe um círculo bem grande, como se fosse o mostrador de um relógio, e coloque todos os números. Em seguida, coloque os ponteiros marcando 11 horas e 10 minutos."
      
      Avalie de acordo com os critérios de Shulman (0 a 5):
      5: Perfeito. Todos os números presentes e na ordem correta, ponteiros corretos.
      4: Pequenos erros visuais ou de espaçamento, mas a hora (11:10) está claramente representável.
      3: Números e mostrador ok, mas erro na marcação da hora (ponteiros errados).
      2: Desorganização moderada dos números, hora impossível de ler ou muito errada.
      1: Desorganização severa, números faltando ou perseveração, sem ponteiros ou ponteiros aleatórios.
      0: Não representação de relógio ou recusa.
      
      Retorne APENAS o número da pontuação (0-5) no formato JSON.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          { inlineData: { mimeType: "image/png", data: cleanBase64 } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.INTEGER, description: "Score from 0 to 5" },
            reasoning: { type: Type.STRING, description: "Short explanation" }
          }
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    return result.score ?? 0;

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return 0; // Fallback
  }
}