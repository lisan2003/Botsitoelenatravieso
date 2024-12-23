import { addKeyword, EVENTS } from "@builderbot/bot";
import AIClass from "../services/ai";
import { getHistoryParse, handleHistory } from "../utils/handleHistory";
import { generateTimer } from "../utils/generateTimer";
import { getCurrentCalendar } from "../services/calendar";
import { getFullCurrentDate } from "src/utils/currentDate";
import { flowConfirm } from "./confirm.flow";
import {
    addMinutes,
    parse,
    format,
    getHours,
    getDay,
    addDays,
} from "date-fns";

const DURATION_MEET = parseInt(process.env.DURATION_MEET ?? "60", 10);

interface CalendarEntry {
    name: string;
    fromDate: Date;
    toDate: Date;
}

const PROMPT_FILTER_DATE = `
### Contexto
Eres un asistente de inteligencia artificial. Tu propósito es determinar la fecha y hora que el cliente quiere, en el formato yyyy/MM/dd HH:mm:ss.

### Fecha y Hora Actual:
{CURRENT_DAY}

### Registro de Conversación:
{HISTORY}

Asistente: "{respuesta en formato (yyyy/MM/dd HH:mm:ss)}"
`;

const generatePromptFilter = (history: string): string => {
    const nowDate = getFullCurrentDate();
    return PROMPT_FILTER_DATE.replace("{HISTORY}", history).replace(
        "{CURRENT_DAY}",
        nowDate
    );
};

let lastScheduledDate: Date | null = null; // Variable para almacenar el último turno agendado

const flowSchedule = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { extensions, state, flowDynamic, endFlow }) => {
        await flowDynamic("Dame un momento para consultar la agenda...");
        const ai = extensions.ai as AIClass;
        const history = getHistoryParse(state);

        // Obtener y tipar correctamente la lista de horarios ocupados
        const calendarList: string[] = await getCurrentCalendar();
        const parsedList: CalendarEntry[] = calendarList.map((entry) => {
            const [name, rawDate] = entry.split(",");
            const fromDate = parse(rawDate.trim(), "yyyy/MM/dd HH:mm:ss", new Date());
            return {
                name,
                fromDate,
                toDate: addMinutes(fromDate, DURATION_MEET),
            };
        });

        // Generar el prompt para determinar la fecha deseada
        const promptFilter = generatePromptFilter(history);
        const { date }: { date: string } = await ai.desiredDateFn([
            { role: "system", content: promptFilter },
        ]);

        let desiredDate = parse(date, "yyyy/MM/dd HH:mm:ss", new Date());

        // Validar si el horario solicitado ya está ocupado
        const isDateOccupied = parsedList.some(
            ({ fromDate, toDate }) =>
                desiredDate < toDate && addMinutes(desiredDate, DURATION_MEET) > fromDate
        );

        if (isDateOccupied) {
            // Si el horario solicitado está ocupado, buscar el siguiente disponible
            let nextAvailableDate = new Date(desiredDate);
            let foundAvailable = false;

            // Intentar encontrar el próximo horario disponible
            while (!foundAvailable) {
                nextAvailableDate = addMinutes(nextAvailableDate, DURATION_MEET);
                const isNextDateOccupied = parsedList.some(
                    ({ fromDate, toDate }) =>
                        nextAvailableDate < toDate && addMinutes(nextAvailableDate, DURATION_MEET) > fromDate
                );
                if (!isNextDateOccupied) {
                    foundAvailable = true;
                }
            }

            // Proponer el siguiente horario disponible
            const formattedDate = format(nextAvailableDate, "yyyy/MM/dd HH:mm:ss");
            const msg = `El horario cercano disponible es: ${formattedDate}. ¿Confirmo tu reserva en este horario? *si*`;
            await flowDynamic(msg);
            await handleHistory({ content: msg, role: "assistant" }, state);
            await state.update({ desiredDate: nextAvailableDate });
            return endFlow();
        }

        // Validar horarios laborales (9:00 - 16:00)
        const desiredHour = getHours(desiredDate);
        if (desiredHour < 9 || desiredHour >= 16) {
            const msg =
                "Lo siento, esa hora está fuera del horario laboral. ¿Alguna otra fecha y hora?";
            await flowDynamic(msg);
            await handleHistory({ content: msg, role: "assistant" }, state);
            return endFlow();
        }

        // Validar fines de semana
        const dayOfWeek = getDay(desiredDate);
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            const msg =
                "Lo siento, no trabajamos los fines de semana. Por favor, indícame otra fecha y hora.";
            await flowDynamic(msg);
            await handleHistory({ content: msg, role: "assistant" }, state);
            return endFlow();
        }

        // Confirmar disponibilidad y sugerir horario
        const formattedDate = format(desiredDate, "yyyy/MM/dd HH:mm:ss");
        const msg = `¡Perfecto! El horario ${formattedDate} está disponible. ¿Confirmo tu reserva? *si*`;
        await flowDynamic(msg);
        await handleHistory({ content: msg, role: "assistant" }, state);

        // Actualizar el estado con la fecha deseada
        lastScheduledDate = desiredDate; // Guardar la última fecha agendada
        await state.update({ desiredDate });
    })
    .addAction({ capture: true }, async ({ body }, { gotoFlow, flowDynamic, state }) => {
        const confirmationWords = [
            "si",
            "claro",
            "por supuesto",
            "vale",
            "ok",
            "de acuerdo",
            "entendido",
            "dale",
        ];
        if (confirmationWords.some((word) => body.toLowerCase().includes(word))) {
            return gotoFlow(flowConfirm);
        }
        await flowDynamic("¿Alguna otra fecha y hora?");
        await state.update({ desiredDate: null });
    });

export { flowSchedule };
