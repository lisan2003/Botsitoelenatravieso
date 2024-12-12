import { MAKE_ADD_TO_CALENDAR, MAKE_GET_FROM_CALENDAR } from 'src/config'
import { format, parse } from 'date-fns';

/**
 * get current calendar
 * @returns 
 */
const getCurrentCalendar = async (): Promise<string[]> => {
    const dataCalendarApi = await fetch(MAKE_GET_FROM_CALENDAR);
    const json: { date: string, name: string }[] = await dataCalendarApi.json();
    console.log({ json });
    
    const list = json
        .filter(({date, name}) => !!date && !!name)
        .reduce((prev, current) => {
            // Asegurarse de que la fecha esté en el formato correcto yyyy/MM/dd HH:mm:ss
            const formattedDate = format(parse(current.date, 'yyyy/MM/dd HH:mm:ss', new Date()), 'yyyy/MM/dd HH:mm:ss');
            prev.push(formattedDate);
            return prev;
        }, []);
    return list;
}

/**
 * add to calendar
 * @param payload 
 * @returns 
 */
const appToCalendar = async (payload: { name: string, email: string, startDate: string, phone: string }) => {
    try {
        // Asegurarse de que la fecha esté en el formato correcto yyyy/MM/dd HH:mm:ss
        const formattedStartDate = format(parse(payload.startDate, 'yyyy/MM/dd HH:mm:ss', new Date()), 'yyyy/MM/dd HH:mm:ss');
        
        // Crear el payload con la fecha formateada
        const formattedPayload = {
            ...payload,
            startDate: formattedStartDate,
        };

        const dataApi = await fetch(MAKE_ADD_TO_CALENDAR, {
            method: 'POST',
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(formattedPayload)
        });
        return dataApi;
    } catch (err) {
        console.log(`error: `, err);
    }
}

export { getCurrentCalendar, appToCalendar };
