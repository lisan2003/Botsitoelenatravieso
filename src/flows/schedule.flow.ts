import { addKeyword, EVENTS } from "@builderbot/bot";
import AIClass from "../services/ai";
import { getHistoryParse, handleHistory } from "../utils/handleHistory";
import { generateTimer } from "../utils/generateTimer";
import { getCurrentCalendar } from "../services/calendar";
import { getFullCurrentDate } from "src/utils/currentDate";
import { flowConfirm } from "./confirm.flow";
import { addMinutes, isWithinInterval, format, parse, setHours, setMinutes, isValid, isAfter } from "date-fns";
import * as chrono from "chrono-node";

// Definir horario de apertura y cierre del negocio
const BUSINESS_HOURS = {
    start: '09:00', // Hora de apertura (formato 24h)
    end: '18:00',   // Hora de cierre (formato 24h)
    days: ['lunes','martes','miercoles','jueves','viernes'], // Días de la semana
};

const DURATION_MEET = Number(process.env.DURATION_MEET) ?? 45;

const PROMPT_FILTER_DATE = `
### Contexto
Eres un asistente de inteligencia artificial. Tu propósito es determinar la fecha y hora que el cliente quiere, en el formato yyyy/MM/dd HH:mm:ss.

### Fecha y Hora Actual:
{CURRENT_DAY}

### Registro de Conversación:
{HISTORY}

Asistente: "{respuesta en formato (yyyy/MM/dd HH:mm:ss)}"
`;

const generatePromptFilter = (history: string) => {
    const nowDate = getFullCurrentDate();
    const mainPrompt = PROMPT_FILTER_DATE
        .replace('{HISTORY}', history)
        .replace('{CURRENT_DAY}', nowDate);

    return mainPrompt;
};

const roundToNearest30Minutes = (date: Date) => {
    const minutes = date.getMinutes();
    const roundedMinutes = Math.ceil(minutes / 30) * 30;
    return setMinutes(setHours(date, date.getHours()), roundedMinutes);
};

const isBusinessHours = (desiredDate) => {
    const dayOfWeek = format(desiredDate, 'iiii'); 

    if (!BUSINESS_HOURS.days.includes(dayOfWeek)) {
        return false;
    }

    const startOfDay = setHours(setMinutes(new Date(desiredDate), 0), 9); 
    const endOfDay = setHours(setMinutes(new Date(desiredDate), 0), 18);

    return isWithinInterval(desiredDate, { start: startOfDay, end: endOfDay });
};

const suggestAvailableTime = (listParse, businessStartTime, businessEndTime) => {
    const currentTime = new Date();

    let suggestedTime = businessStartTime;
    while (isAfter(suggestedTime, currentTime)) {
        const suggestedEndTime = addMinutes(suggestedTime, DURATION_MEET);

        const isAvailable = listParse.every(({ fromDate, toDate }) =>
            !isWithinInterval(suggestedTime, { start: fromDate, end: toDate }) &&
            !isWithinInterval(suggestedEndTime, { start: fromDate, end: toDate })
        );

        if (isAvailable) {
            return suggestedTime;
        }

        suggestedTime = addMinutes(suggestedTime, 30);
    }

    return null; 
};

const parseDateExpression = (expression: string) => {
    const parsedDate = chrono.parseDate(expression);
    return parsedDate;
};

export const flowSchedule = addKeyword(EVENTS.ACTION).addAction(async (ctx, { extensions, state, flowDynamic, endFlow }) => {
    await flowDynamic('Dame un momento para consultar la agenda...');
    const ai = extensions.ai as AIClass;
    const history = getHistoryParse(state);

    const listParse = await getCurrentCalendar();

    const promptFilter = generatePromptFilter(history);

    const { date } = await ai.desiredDateFn([
        {
            role: 'system',
            content: promptFilter,
        },
    ]);

    let desiredDate;
    if (!date) {
        const message = 'Lo siento, no pude entender tu solicitud. ¿Podrías darme más detalles sobre la fecha y hora?';
        await flowDynamic(message);
        await handleHistory({ content: message, role: 'assistant' }, state);
        return endFlow();
    }

    // Si no es una fecha exacta, intentar interpretar expresiones como "lunes que viene"
    const parsedDate = parseDateExpression(date);
    if (parsedDate) {
        desiredDate = roundToNearest30Minutes(parsedDate);
    } else {
        const message = 'No pude entender la fecha. ¿Podrías proporcionarme más detalles?';
        await flowDynamic(message);
        await handleHistory({ content: message, role: 'assistant' }, state);
        return endFlow();
    }

    if (!isValid(desiredDate)) {
        const message = 'La fecha proporcionada no es válida. Por favor, intenta de nuevo con el formato correcto: `YYYY/MM/DD HH:mm`.';
        await flowDynamic(message);
        await handleHistory({ content: message, role: 'assistant' }, state);
        return endFlow();
    }

    const desiredEndDate = addMinutes(desiredDate, DURATION_MEET);

    if (!isBusinessHours(desiredDate)) {
        const message = 'Lo siento, el horario solicitado está fuera del horario de atención (09:00 - 18:00). ¿Puedes elegir otro horario dentro de este rango?';
        await flowDynamic(message);
        await handleHistory({ content: message, role: 'assistant' }, state);
        return endFlow();
    }

    const isDateAvailable = listParse.every(({ fromDate, toDate }) =>
        !isWithinInterval(desiredDate, { start: fromDate, end: toDate }) &&
        !isWithinInterval(desiredEndDate, { start: fromDate, end: toDate })
    );

    if (!isDateAvailable) {
        const message = 'Lo siento, esa hora ya está reservada. ¿Podrías elegir otra fecha u horario?';
        await flowDynamic(message);
        await handleHistory({ content: message, role: 'assistant' }, state);
        return endFlow();
    }

    const formattedDateFrom = format(desiredDate, 'hh:mm a');
    const formattedDateTo = format(desiredEndDate, 'hh:mm a');
    const message = `¡Perfecto! Tenemos disponibilidad de ${formattedDateFrom} a ${formattedDateTo} el día ${format(desiredDate, 'dd/MM/yyyy')}. ¿Confirmo tu reserva?`;
    await handleHistory({ content: message, role: 'assistant' }, state);
    await state.update({ desiredDate });

    const chunks = message.split(/(?<!\d)\.\s+/g);
    for (const chunk of chunks) {
        await flowDynamic([{ body: chunk.trim(), delay: generateTimer(150, 250) }]);
    }
}).addAction({ capture: true }, async ({ body }, { gotoFlow, flowDynamic, state }) => {
    const confirmText = ['si', 'sí', 'confirmo', 'confirmar', 'correcto', 'acepto', 'aceptar'];

    if (confirmText.includes(body.toLowerCase())) {
        const message = 'Tu reserva ha sido confirmada. ¡Nos vemos pronto!';
        await flowDynamic(message);
        await state.update({ status: 'confirmada' });
        return gotoFlow(flowConfirm);
    }

    const message = 'Lo siento, no pude procesar tu solicitud. ¿Te gustaría intentar con otra fecha o día?';
    await flowDynamic(message);
});
