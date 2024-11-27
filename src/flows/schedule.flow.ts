import { addKeyword, EVENTS } from "@builderbot/bot";
import AIClass from "../services/ai";
import { getHistoryParse, handleHistory } from "../utils/handleHistory";
import { generateTimer } from "../utils/generateTimer";
import { getCurrentCalendar } from "../services/calendar";
import { getFullCurrentDate } from "src/utils/currentDate";
import { flowConfirm } from "./confirm.flow";
import { addMinutes, isWithinInterval, format, parse, setHours, setMinutes, isValid, isAfter } from "date-fns";

// Definir horario de apertura y cierre del negocio
const BUSINESS_HOURS = {
    start: '09:00', // Hora de apertura (formato 24h)
    end: '18:00',   // Hora de cierre (formato 24h)
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], // Días de la semana
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

// Función para redondear la fecha al siguiente bloque de 30 minutos
const roundToNearest30Minutes = (date: Date) => {
    const minutes = date.getMinutes();
    const roundedMinutes = Math.ceil(minutes / 30) * 30;
    return setMinutes(setHours(date, date.getHours()), roundedMinutes);
};

// Función para validar que la hora esté dentro del horario de atención
const isBusinessHours = (desiredDate) => {
    const dayOfWeek = format(desiredDate, 'iiii'); // Obtener el día de la semana (ej. 'Monday', 'Tuesday', etc.)

    // Verificar si el día está dentro de los días de operación del negocio
    if (!BUSINESS_HOURS.days.includes(dayOfWeek)) {
        return false;
    }

    // Obtener las horas de apertura y cierre
    const startOfDay = setHours(setMinutes(new Date(desiredDate), 0), 9); // 09:00
    const endOfDay = setHours(setMinutes(new Date(desiredDate), 0), 18); // 18:00

    return isWithinInterval(desiredDate, { start: startOfDay, end: endOfDay });
};

// Función para sugerir un horario disponible
const suggestAvailableTime = (listParse, businessStartTime, businessEndTime) => {
    const currentTime = new Date();

    let suggestedTime = businessStartTime;
    while (isAfter(suggestedTime, currentTime)) {
        const suggestedEndTime = addMinutes(suggestedTime, DURATION_MEET);

        // Verificar si el bloque de tiempo sugerido está disponible
        const isAvailable = listParse.every(({ fromDate, toDate }) =>
            !isWithinInterval(suggestedTime, { start: fromDate, end: toDate }) &&
            !isWithinInterval(suggestedEndTime, { start: fromDate, end: toDate })
        );

        if (isAvailable) {
            return suggestedTime;
        }

        // Incrementamos el tiempo sugerido por 30 minutos
        suggestedTime = addMinutes(suggestedTime, 30);
    }

    return null; // Si no hay horarios disponibles
};

// Flujo para consultar y agendar citas
export const flowSchedule = addKeyword(EVENTS.ACTION).addAction(async (ctx, { extensions, state, flowDynamic, endFlow }) => {
    await flowDynamic('Dame un momento para consultar la agenda...');
    const ai = extensions.ai as AIClass;
    const history = getHistoryParse(state);

    // Obtenemos la agenda actual
    const listParse = await getCurrentCalendar();

    // Generamos el prompt para el modelo AI
    const promptFilter = generatePromptFilter(history);

    // Obtenemos la fecha deseada del usuario
    const { date } = await ai.desiredDateFn([
        {
            role: 'system',
            content: promptFilter,
        },
    ]);

    // Si el usuario no proporciona una fecha, sugerir un horario
    if (!date) {
        const businessStartTime = parse(BUSINESS_HOURS.start, 'HH:mm', new Date());
        const businessEndTime = parse(BUSINESS_HOURS.end, 'HH:mm', new Date());

        const suggestedTime = suggestAvailableTime(listParse, businessStartTime, businessEndTime);

        if (suggestedTime) {
            const formattedSuggestedTime = format(suggestedTime, 'yyyy/MM/dd HH:mm');
            await flowDynamic(`No mencionaste un horario específico. Te sugiero el siguiente horario disponible: ${formattedSuggestedTime}. ¿Te gustaría reservar ese horario?`);
            await handleHistory({ content: `Sugerido: ${formattedSuggestedTime}`, role: 'assistant' }, state);
            await state.update({ desiredDate: suggestedTime });
            return;
        } else {
            const message = 'Lo siento, no tengo disponibilidad en este momento. ¿Te gustaría intentar con otra fecha u horario?';
            await flowDynamic(message);
            await handleHistory({ content: message, role: 'assistant' }, state);
            return endFlow();
        }
    }

    const desiredDate = roundToNearest30Minutes(parse(date, 'yyyy/MM/dd HH:mm:ss', new Date()));

    // Validar que la fecha sea válida
    if (!isValid(desiredDate)) {
        const message = 'La fecha proporcionada no es válida. Por favor, intenta de nuevo con el formato correcto: `YYYY/MM/DD HH:mm`.';
        await flowDynamic(message);
        await handleHistory({ content: message, role: 'assistant' }, state);
        return endFlow();
    }

    const desiredEndDate = addMinutes(desiredDate, +DURATION_MEET);

    // Validamos si está dentro del horario de atención
    if (!isBusinessHours(desiredDate)) {
        const message = 'Lo siento, el horario solicitado está fuera del horario de atención (09:00 - 18:00). ¿Puedes elegir otro horario dentro de este rango?';
        await flowDynamic(message);
        await handleHistory({ content: message, role: 'assistant' }, state);
        return endFlow();
    }

    // Validamos si el horario está disponible
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

    // Confirmación de reserva
    const formattedDateFrom = format(desiredDate, 'hh:mm a');
    const formattedDateTo = format(desiredEndDate, 'hh:mm a');
    const message = `¡Perfecto! Tenemos disponibilidad de ${formattedDateFrom} a ${formattedDateTo} el día ${format(desiredDate, 'dd/MM/yyyy')}. ¿Confirmo tu reserva?`;
    await handleHistory({ content: message, role: 'assistant' }, state);
    await state.update({ desiredDate });

    // Enviar mensaje de confirmación dividido
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
