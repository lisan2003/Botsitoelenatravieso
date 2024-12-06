import { addKeyword, EVENTS } from "@builderbot/bot";
import { generateTimer } from "../utils/generateTimer";
import { getHistoryParse, handleHistory } from "../utils/handleHistory";
import AIClass from "../services/ai";
import { getFullCurrentDate } from "src/utils/currentDate";
import { pdfQuery } from "src/services/pdf";

const PROMPT_SELLER = `Como experto en ventas con aproximadamente 15 años de experiencia en embudos de ventas y generación de leads, tu tarea es mantener una conversación agradable, responder a las preguntas del cliente sobre nuestros productos y, finalmente, guiarlos para reservar una cita. Tus respuestas deben basarse únicamente en el contexto proporcionado:

### DÍA ACTUAL
{CURRENT_DAY}

### HISTORIAL DE CONVERSACIÓN (Cliente/Vendedor)
{HISTORY}

### BASE DE DATOS
{DATABASE}

Para proporcionar respuestas más útiles, puedes utilizar la información proporcionada en la base de datos. El contexto es la única información que tienes. Ignora cualquier cosa que no esté relacionada con el contexto.

### EJEMPLOS DE RESPUESTAS IDEALES:

- buenas bienvenido a..
- un gusto saludarte en..
- por supuesto tenemos eso y ...

### INTRUCCIONES
- Mantén un tono profesional y siempre responde en primera persona.
- NO ofrescas promociones que no existe en la BASE DE DATOS

Respuesta útil adecuadas para enviar por WhatsApp (en español):`


export const generatePromptSeller = (history: string, database:string) => {
    const nowDate = getFullCurrentDate()
    return PROMPT_SELLER
        .replace('{HISTORY}', history)
        .replace('{CURRENT_DAY}', nowDate)
        .replace('{DATABASE}', database)
};

const flowSeller = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, extensions }) => {
        try {

            const ai = extensions.ai as AIClass
            const history = getHistoryParse(state)
            
            const dataBase =`
                ¡Descubre la belleza de la micropigmentación!

                Realzamos tu belleza natural con técnicas de maquillaje semipermanente diseñadas para destacar tus mejores rasgos. 💖

                🌟 Cejas:
                Creamos un diseño personalizado y aplicamos pigmentación para un acabado natural que dura hasta 2 años.
                Nuestros servicios:
                🌟 Labios:
                Damos color y definición para un look fresco y uniforme que puede durar entre 1 y 3 años.
                
                Precios:
                💼 Cejas: $100
                💼 Labios: $500
                
                ¿Listo para lucir increíble?
                ✨ Consulta disponibilidad y resuelve todas tus dudas aquí.
                `;
                
            //const dataBase = await pdfQuery(ctx.body)
            console.log({dataBase})
            const promptInfo = generatePromptSeller(history, dataBase)

            const response = await ai.createChat([
                {
                    role: 'system',
                    content: promptInfo
                }
            ])

            await handleHistory({ content: response, role: 'assistant' }, state)
            const chunks = response.split(/(?<!\d)\.\s+/g);
            for (const chunk of chunks) {
                await flowDynamic([{ body: chunk.trim(), delay: generateTimer(150, 250) }]);
            }
        } catch (err) {
            console.log(`[ERROR]:`, err)
            return
        }
    })

export { flowSeller }