
import { GoogleGenAI } from "@google/genai";

export const generateBatchDescription = async (prompt: string): Promise<string> => {
  // FIX: Per @google/genai coding guidelines, removed explicit check for process.env.API_KEY.
  // The API key is assumed to be configured in the environment.
  // The outer try/catch block will handle any potential errors during initialization or API calls.
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: "You are a helpful assistant for generating concise and professional descriptions for subpoena batches for a notary's office. The generated text must be in Portuguese, objective, and professionally describe the contents of the batch."
      }
    });

    return response.text;
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    return 'Erro ao gerar descrição. Por favor, tente novamente.';
  }
};
