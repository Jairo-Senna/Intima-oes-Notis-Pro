
import { GoogleGenAI } from "@google/genai";

export const generateBatchDescription = async (prompt: string): Promise<string> => {
  if (typeof process === 'undefined' || !process.env.API_KEY) {
    console.error("API_KEY environment variable not set or 'process' is not defined. A build step might be required.");
    return "A chave de API não está configurada. Para que a funcionalidade de IA funcione, a aplicação pode precisar de um passo de compilação (build) para injetar as variáveis de ambiente. Entre em contato com o suporte.";
  }
  
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