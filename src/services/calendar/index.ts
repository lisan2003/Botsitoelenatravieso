import { MAKE_ADD_TO_CALENDAR, MAKE_GET_FROM_CALENDAR } from 'src/config';
import { parse, addMinutes } from 'date-fns';
const DURATION_MEET = process.env.DURATION_MEET ?? 60;

/**
 * Formatea una fecha al formato deseado (YYYY/MM/DD hh:mm:ss).
 * @param date Fecha en cualquier formato compatible con Date.
 * @returns Fecha formateada o una cadena vacía si la fecha no es válida.
 */
const formatDateTime = (date: string): string => {
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
        console.warn(`Fecha inválida encontrada: ${date}`);
        return "";
    }

    const year = parsedDate.getFullYear();
    const month = String(parsedDate.getMonth() + 1).padStart(2, "0"); // Meses de 0-11
    const day = String(parsedDate.getDate()).padStart(2, "0");
    const hours = String(parsedDate.getHours()).padStart(2, "0");
    const minutes = String(parsedDate.getMinutes()).padStart(2, "0");
    const seconds = String(parsedDate.getSeconds()).padStart(2, "0");

    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
};

/**
 * Redondea una fecha a intervalos de 30 minutos hacia adelante.
 * @param date Fecha original.
 * @returns Fecha redondeada.
 */
const roundToNearest30Minutes = (date: Date): Date => {
    const minutes = date.getMinutes();
    const adjustment = minutes % 30 === 0 ? 0 : 30 - (minutes % 30);
    return addMinutes(date, adjustment);
};

/**
 * Valida si una fecha tiene el formato esperado (yyyy/MM/dd HH:mm:ss).
 * @param dateString Fecha a validar.
 * @returns Verdadero si el formato es válido.
 */
const isValidDate = (dateString: string): boolean => {
    const regex = /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/; // Verifica el formato 'yyyy/MM/dd HH:mm:ss'
    return regex.test(dateString);
};

/**
 * Obtiene el calendario de la API y convierte las fechas a objetos Date.
 * @returns Lista de fechas existentes como intervalos.
 */
const getCurrentCalendar = async (): Promise<{ fromDate: Date; toDate: Date }[]> => {
    try {
        const response = await fetch(MAKE_GET_FROM_CALENDAR);
        const json: { fecha: string | null; nombre: string | null }[] = await response.json();

        console.log({ json });

        // Si la API no retorna datos válidos, devolver una lista vacía.
        if (!json || json.length === 0) {
            console.log("No hay eventos agendados.");
            return [];
        }

        return json.map(({ fecha }) => {
            // Si la fecha es null, simplemente la ignoramos y seguimos con la próxima
            if (fecha === null) {
                console.warn(`Fecha es null, continuamos con el siguiente evento.`);
                return { fromDate: new Date(), toDate: new Date() }; // Devuelve una fecha por defecto
            }

            // Si la fecha no es válida, advertimos y no la procesamos
            if (!isValidDate(fecha)) {
                console.warn(`Fecha inválida encontrada: ${fecha}`);
                return { fromDate: new Date(), toDate: new Date() }; // Devuelve una fecha por defecto
            }

            const fromDate = roundToNearest30Minutes(parse(fecha, 'yyyy/MM/dd HH:mm:ss', new Date()));
            const toDate = addMinutes(fromDate, +DURATION_MEET);
            return { fromDate, toDate };
        });
    } catch (error) {
        console.error("Error fetching calendar data:", error);
        return [];
    }
};

/**
 * Agrega un evento al calendario.
 * @param payload Datos del evento a agregar.
 * @returns Respuesta de la API.
 */
const appToCalendar = async (payload: { name: string; email: string; startDate: string; phone: string }) => {
    try {
        const response = await fetch(MAKE_ADD_TO_CALENDAR, {
            method: 'POST',
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });
        return response;
    } catch (err) {
        console.error(`Error al agregar al calendario:`, err);
        return null;
    }
};

export { getCurrentCalendar, appToCalendar, roundToNearest30Minutes };
