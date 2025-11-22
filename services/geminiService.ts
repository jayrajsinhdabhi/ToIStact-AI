import { GoogleGenAI } from "@google/genai";
import { Dimension, StackupResult, DimensionType } from "../types";

const getAIClient = () => {
  if (!process.env.API_KEY) {
    console.error("API_KEY is missing from environment variables.");
    return null;
  }
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const analyzeStackupWithGemini = async (
  dimensions: Dimension[],
  results: StackupResult
): Promise<string> => {
  const ai = getAIClient();
  if (!ai) return "API Key is missing. Please check configuration.";

  const dimList = dimensions
    .map(
      (d) =>
        `- ${d.name} ${d.description ? `(${d.description})` : ''} [${d.type}]: Nom ${d.nominal}, +${d.tolerancePlus}/-${d.toleranceMinus}`
    )
    .join("\n");

  const prompt = `
    You are a Senior Mechanical Engineer specializing in Tolerance Stackup Analysis (GD&T).
    Analyze the following tolerance stackup loop for an assembly.

    **Context**:
    We are calculating the gap/interference between components. 
    Positive Gap = Clearance (Good). Negative Gap = Interference (Bad, potentially).
    
    **Stackup Data**:
    ${dimList}

    **Calculated Results**:
    - Nominal Gap: ${results.nominalGap.toFixed(4)}
    - Worst Case Range: [${results.worstCaseMin.toFixed(4)}, ${results.worstCaseMax.toFixed(4)}]
    - RSS (Statistical) Range: [${results.rssMin.toFixed(4)}, ${results.rssMax.toFixed(4)}]
    - Interference Probability (Est): ${results.interferenceProb.toFixed(2)}%

    **Task**:
    1. **Evaluate the Risk**: Is this assembly safe for mass production?
    2. **Identify Contributors**: Which dimension is the biggest contributor to the variation?
    3. **Recommendations**: Suggest 3 specific engineering changes (e.g., change a specific tolerance, shift a nominal) to improve the design if there is interference or if the clearance is too tight.
    
    Keep the response concise, professional, and actionable. Format with Markdown.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    return response.text || "No analysis generated.";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "Failed to generate AI analysis. Please try again later.";
  }
};