import { Type } from "@google/genai";

export const leanMealSchema = {
  type: Type.OBJECT,
  properties: {
    type: { type: Type.STRING, description: "breakfast | lunch | dinner | snack" },
    name: { type: Type.STRING, description: "Short meal name" },
    cal: { type: Type.INTEGER },
    pro: { type: Type.NUMBER },
    carb: { type: Type.NUMBER },
    fat: { type: Type.NUMBER },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          weight: { type: Type.INTEGER, description: "grams" },
          cal: { type: Type.INTEGER },
          pro: { type: Type.NUMBER },
          carb: { type: Type.NUMBER },
          fat: { type: Type.NUMBER }
        },
        required: ["name", "cal", "pro", "carb", "fat"]
      }
    }
  },
  required: ["type", "name", "cal", "pro", "carb", "fat", "items"]
};
